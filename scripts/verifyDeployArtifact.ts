/**
 * Refuse to treat a build directory as deployable unless it is a production bundle:
 *   npm run verify:artifact -- dist
 *
 * Reads build-info.json (written by every `vite build`) and scans the JavaScript bundles for e2e, mock-API or
 * development markers (see assessArtifact in src/config/deployment.ts). Exits 1 with the reasons if the directory
 * must not be deployed. Run it on the exact directory a deployment would upload.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessArtifact, BUILD_INFO_FILE } from '../src/config/deployment.ts';

function javascriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return javascriptFiles(path);
    return /\.(m?js)$/.test(name) ? [path] : [];
  });
}

export function verifyArtifactDir(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`Build directory not found: ${dir}`];

  let buildInfo: unknown = null;
  const infoPath = join(dir, BUILD_INFO_FILE);
  if (existsSync(infoPath)) {
    try {
      buildInfo = JSON.parse(readFileSync(infoPath, 'utf8'));
    } catch {
      return [`${BUILD_INFO_FILE} is not valid JSON.`];
    }
  }
  const bundles = javascriptFiles(dir).map(file => readFileSync(file, 'utf8'));
  return assessArtifact({ buildInfo, bundles });
}

function main(): number {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npm run verify:artifact -- <build directory>');
    return 2;
  }
  const dir = resolve(target);
  const errors = verifyArtifactDir(dir);
  if (errors.length > 0) {
    console.error(`NOT deployable: ${dir}\n  - ${errors.join('\n  - ')}`);
    return 1;
  }
  console.log(`Deployable production build: ${dir}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
