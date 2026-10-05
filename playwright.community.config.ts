import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: './e2e',
    testMatch: 'community-offline.spec.ts',
    timeout: 45000,
    workers: 1,
    use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        baseURL: 'http://127.0.0.1:5175',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5175',
        timeout: 120000,
        reuseExistingServer: !process.env.CI
    }
});
