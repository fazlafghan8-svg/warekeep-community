import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    },
    test: {
        // Non-secret placeholders make a clean checkout testable without .env files.
        env: {
            VITE_SUPABASE_URL: 'https://test.invalid',
            VITE_SUPABASE_ANON_KEY: 'test-placeholder-key'
        },
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.js', 'scripts/__tests__/**/*.test.mjs'],
        coverage: {
            reporter: ['text', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.d.ts', 'src/test/**']
        }
    }
});
