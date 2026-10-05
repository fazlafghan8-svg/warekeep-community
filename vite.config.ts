import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_WATCH_IGNORES = [
    '**/dist/**', '**/release/**', '**/artifacts/**', '**/playwright-artifacts/**',
    '**/test-results/**', '**/logs/**', '**/_warekeep_logs/**', '**/*.log', '**/*.zip',
];
// This public configuration has one offline edition and never loads private env files.
export default defineConfig(({ mode }) => {
    const communityCsp = [
        "default-src 'self' data: blob: file:",
        mode === 'production'
            ? "script-src 'self' 'unsafe-inline' blob:"
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: file:",
        "font-src 'self' data: file:",
        "worker-src 'self' blob:",
        mode === 'production'
            ? "connect-src data: blob: file:"
            : "connect-src 'self' data: blob: file: ws://localhost:5175 ws://127.0.0.1:5175 ws://[::1]:5175",
        "object-src 'none'",
        "form-action 'none'",
        "base-uri 'self'",
    ].join('; ');
    return {
        envDir: false,
        envPrefix: [],
        publicDir: 'public-community',
        plugins: [react(), {
                name: 'warekeep-community-offline-html',
                transformIndexHtml: {
                    order: 'pre',
                    handler(html) {
                        if (!html.includes('src="/src/index.tsx"')
                            && !html.includes('src="/src/index.community.tsx"')) {
                            throw new Error('Community HTML entry could not be found.');
                        }
                        return html
                            .replace('src="/src/index.tsx"', 'src="/src/index.community.tsx"')
                            .replace(/<script\b[^>]*type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, `<meta http-equiv="Content-Security-Policy" content="${communityCsp}" />`)
                            .replace(/<title>[^<]*<\/title>/, '<title>WareKeep Community</title>');
                    },
                },
            }],
        base: './',
        resolve: { alias: { '@': resolve(__dirname, './src') } },
        define: { 'import.meta.env.VITE_APP_EDITION': JSON.stringify('community') },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            target: 'chrome120',
            minify: 'oxc',
            sourcemap: false,
            chunkSizeWarningLimit: 1000,
            rollupOptions: { input: { main: resolve(__dirname, 'index.html') } },
        },
        server: {
            host: '127.0.0.1', port: 5175, strictPort: true,
            hmr: { overlay: true }, watch: { ignored: GENERATED_WATCH_IGNORES },
        },
        preview: { host: '127.0.0.1', port: 4175, strictPort: true },
    };
});
