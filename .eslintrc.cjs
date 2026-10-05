module.exports = {
    root: true,
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'release/',
        'coverage/',
        'test-results/',
        'playwright-report/',
        'tmp/',
        'build/',
        'public/',
        'installer-bootstrapper/',
        'tools/',
        'backend/node_modules/',
    ],
    overrides: [
        {
            files: ['src/**/*.ts', 'src/**/*.tsx', 'e2e/**/*.ts', '*.ts'],
            parser: '@typescript-eslint/parser',
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            env: {
                browser: true,
                es2022: true,
            },
            plugins: ['react-hooks'],
            rules: {
                'no-undef': 'off',
                'no-unreachable': 'error',
                'no-constant-condition': ['error', { checkLoops: false }],
                'no-dupe-keys': 'error',
                'no-duplicate-case': 'error',
                'no-self-assign': 'error',
                'no-unused-expressions': 'error',
                'react-hooks/rules-of-hooks': 'error',
            },
        },
        {
            files: ['electron/**/*.js'],
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            env: {
                node: true,
                es2022: true,
            },
            extends: ['eslint:recommended'],
            rules: {
                'no-console': 'off',
                'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            },
        },
        {
            files: ['scripts/e2e/**/*.js'],
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            env: {
                node: true,
                es2022: true,
            },
            extends: ['eslint:recommended'],
            rules: {
                'no-console': 'off',
                'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            },
        },
        {
            files: ['backend/**/*.js', 'scripts/**/*.js', '*.js'],
            env: {
                node: true,
                es2022: true,
                jest: true,
            },
            extends: ['eslint:recommended'],
            rules: {
                'no-console': 'off',
                'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            },
        },
    ],
};
