/**
 * Preserve the established Tailwind v3 cascade while using the v4 compiler.
 * v3 emitted base, components, and utilities before unlayered application CSS.
 * Keeping v4's native layers would make every unlayered app selector override
 * a component/utility regardless of specificity (notably inputs and buttons).
 */
import postcss from 'postcss';
export default function preserveWareKeepCascade() {
    return {
        postcssPlugin: 'warekeep-tailwind-legacy-cascade',
        OnceExit(root) {
            // v3 did not generate arbitrary numeric opacity modifiers such as /96.
            // Keep its configured opacity scale; explicit bracket values still work.
            const legacyOpacity = new Set(Array.from({ length: 21 }, (_, index) => index * 5));
            root.walkRules(rule => {
                // The production optimizer can merge a valid opaque utility with a
                // fallback for an unsupported modifier; remove only that selector.
                const selectors = postcss.list.comma(rule.selector).filter(selector => {
                    const modifier = selector.match(/\\\/(\d+)(?=[:{\s,.#>+~]|$)/);
                    const colorUtility = /(?:bg|text|border|divide|ring|outline|shadow|decoration|placeholder|accent|caret|fill|stroke|from|via|to)-/.test(selector);
                    return !(modifier && colorUtility && !legacyOpacity.has(Number(modifier[1])));
                });
                if (!selectors.length)
                    rule.remove();
                else
                    rule.selector = selectors.join(', ');
            });
            root.walkDecls('display', declaration => {
                if (declaration.parent.type === 'rule' && declaration.parent.selector.includes('[hidden]')) {
                    declaration.important = false;
                }
            });
            root.walkDecls('background-color', declaration => {
                if (!['transparent', '#0000'].includes(declaration.value))
                    return;
                const rule = declaration.parent;
                if (rule.type === 'rule' && rule.parent.type === 'atrule' && rule.parent.params === 'base'
                    && rule.selector.split(',').map(selector => selector.trim()).includes('input')) {
                    // v3 left form-control backgrounds to the browser and utilities.
                    declaration.remove();
                }
            });
            root.walkDecls('--tw-gradient-position', declaration => {
                if (declaration.parent.type === 'rule' && declaration.parent.selector.includes('bg-gradient-to-')) {
                    declaration.value = declaration.value.replace(/\s+in\s+oklab$/, '');
                }
            });
            root.walkDecls('background-image', declaration => {
                const gradient = declaration.value.match(/^(linear|radial)-gradient\(([^,]+),\s*var\(--tw-gradient-stops\)\)$/);
                if (!gradient)
                    return;
                declaration.cloneBefore({ prop: '--tw-gradient-position', value: gradient[2] });
                declaration.value = `${gradient[1]}-gradient(var(--tw-gradient-stops))`;
            });
            root.walkRules(rule => {
                const axis = rule.selector.includes('space-y-') ? 'y' : rule.selector.includes('space-x-') ? 'x' : null;
                const selector = rule.selector.match(/^:where\((.+?)\s*>\s*:not\(:last-child\)\)$/);
                if (!axis || !selector)
                    return;
                const sizeDecl = rule.nodes.find(node => node.type === 'decl' && node.prop === (axis === 'y' ? 'margin-block-end' : 'margin-inline-end'));
                const size = sizeDecl?.value.match(/^calc\((.+) \* calc\(1 - var\(--tw-space-[xy]-reverse\)\)\)$/)?.[1];
                if (!size)
                    throw rule.error('Unsupported space utility; review its legacy spacing semantics.');
                rule.selector = selector[1] + ' > :not([hidden]) ~ :not([hidden])';
                rule.removeAll();
                rule.append({ prop: `--tw-space-${axis}-reverse`, value: '0' });
                rule.append({ prop: axis === 'y' ? 'margin-top' : 'margin-left', value: `calc(${size} * calc(1 - var(--tw-space-${axis}-reverse)))` });
                rule.append({ prop: axis === 'y' ? 'margin-bottom' : 'margin-right', value: `calc(${size} * var(--tw-space-${axis}-reverse))` });
                for (const declaration of rule.nodes)
                    declaration.source = rule.source;
            });
            const order = ['properties', 'theme', 'base', 'components', 'utilities'];
            const layers = new Map(order.map(name => [name, []]));
            root.walkAtRules('layer', rule => {
                if (!rule.nodes) {
                    rule.remove();
                    return;
                }
                if (!layers.has(rule.params)) {
                    throw rule.error(`Unsupported CSS layer in the legacy cascade: ${rule.params}`);
                }
                if (rule.parent !== root) {
                    throw rule.error('Nested CSS layers require explicit cascade review.');
                }
                layers.get(rule.params).push(...rule.nodes.map(node => node.clone()));
                rule.remove();
            });
            const header = [];
            while (root.first && ((root.first.type === 'atrule' && ['charset', 'import'].includes(root.first.name)) || root.first.type === 'comment')) {
                const first = root.first;
                first.remove();
                header.push(first);
            }
            root.prepend(...header, ...order.flatMap(name => layers.get(name)));
        },
    };
}
preserveWareKeepCascade.postcss = true;
