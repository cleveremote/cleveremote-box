import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Injected at esbuild bundle time by scripts/build-sea.js: the SEA release folder doesn't
// ship package.json, so the version must be baked into the binary at build time.
declare const __APP_VERSION__: string | undefined;

const readVersionFromNearestPackageJson = (): string => {
    // Works both when running from src/ (ts-jest/ts-node) and from the compiled dist/src/
    // tree (nest start, node dist/main): walk up until package.json is found on disk.
    let dir = __dirname;
    for (let depth = 0; depth < 8; depth += 1) {
        const candidate = join(dir, 'package.json');
        if (existsSync(candidate)) {
            return JSON.parse(readFileSync(candidate, 'utf8')).version;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return '0.0.0';
};

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : readVersionFromNearestPackageJson();
