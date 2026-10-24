/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder loads this hook as CommonJS */
// electron-builder never copies node_modules through extraResources, so the
// standalone server's traced dependencies are copied here, after packing and
// before the installer (NSIS / DMG / AppImage) is built.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
    const resources = context.electronPlatformName === 'darwin'
        ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(context.appOutDir, 'resources');
    const from = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
    const to = path.join(resources, 'app-server', 'node_modules');
    if (!fs.existsSync(from)) throw new Error(`Missing ${from}; run "npm run build:desktop" first.`);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true, dereference: true });
    console.log(`  • copied server node_modules  to=${to}`);
};
