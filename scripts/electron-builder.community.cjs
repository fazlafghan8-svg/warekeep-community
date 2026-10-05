// Standalone installers contain the app and Electron; installation needs no server.
const fs = require('node:fs');
const path = require('node:path');
const licenseSource = fs.existsSync(path.resolve(__dirname, '../community-publication/LICENSE'))
    ? 'community-publication/LICENSE'
    : 'LICENSE';
module.exports = {
    extends: null,
    appId: 'com.warekeep.community',
    productName: 'WareKeep Community',
    executableName: 'WareKeep Community',
    asar: true,
    directories: { output: 'release/community', buildResources: 'public-community' },
    extraMetadata: { name: 'warekeep-community', warekeepEdition: 'community' },
    files: [
        'dist/**/*',
        'electron/**/*.js',
        'electron/**/*.cjs',
        'package.json',
        '!electron/**/*.test.js',
        '!**/.env',
        '!**/.env.*',
        '!**/*.map',
    ],
    extraResources: [
        { from: licenseSource, to: 'LICENSE' },
        { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
        { from: 'THIRD_PARTY_DEPENDENCIES.md', to: 'THIRD_PARTY_DEPENDENCIES.md' },
    ],
    protocols: [],
    publish: null,
    win: {
        target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }],
        signAndEditExecutable: false,
    },
    nsis: {
        artifactName: 'WareKeep-Community-Setup-${version}-${arch}.${ext}',
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        deleteAppDataOnUninstall: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'WareKeep Community',
        uninstallDisplayName: 'WareKeep Community',
        guid: '494ea2a2-321a-4b73-8d6d-dc67ec0e0490',
        runAfterFinish: true,
    },
    portable: {
        artifactName: 'WareKeep-Community-Portable-${version}-${arch}.${ext}',
    },
};
