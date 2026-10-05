import tailwind from '@tailwindcss/postcss';
import preserveWareKeepCascade from './scripts/tailwind-v3-cascade.mjs';
export default {
    plugins: [tailwind(), preserveWareKeepCascade()],
};
