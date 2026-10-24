// Completes .next/standalone so it can run on its own: Next.js leaves static
// assets and /public out of the standalone folder by design.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(join(standalone, 'server.js'))) {
    console.error('.next/standalone/server.js not found — run `next build` with output: "standalone" first.');
    process.exit(1);
}

for (const [from, to] of [
    [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
    [join(root, 'public'), join(standalone, 'public')],
]) {
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
}

console.log('standalone server ready:', standalone);
