import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyArtifactDir } from '../verifyDeployArtifact.ts';

// Hardening F3: the directory-level check a deployment runs before uploading a build.

const dirs: string[] = [];
function buildDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'algoflow-artifact-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const PROD = { app: 'algoflow', mode: 'production', mockApi: false, deployable: true };
const PROD_JS = 'x({DEV:!1,MODE:`production`,PROD:!0})';
const E2E_JS = 'x({DEV:!1,MODE:`e2e`,PROD:!0,VITE_USE_MOCK_API:`true`})';

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('verifyArtifactDir', () => {
  it('accepts a production build directory', () => {
    const dir = buildDir({ 'build-info.json': JSON.stringify(PROD), 'index.html': '<html></html>', 'assets/index-abc.js': PROD_JS });
    expect(verifyArtifactDir(dir)).toEqual([]);
  });

  it('finds e2e markers in nested bundles even when build-info.json claims production', () => {
    const dir = buildDir({ 'build-info.json': JSON.stringify(PROD), 'assets/chunks/app.js': E2E_JS });
    expect(verifyArtifactDir(dir).join('\n')).toMatch(/mock API compiled in[\s\S]*--mode e2e/);
  });

  it('rejects a directory without build-info.json (e.g. a pre-hardening build)', () => {
    const dir = buildDir({ 'assets/index.js': PROD_JS });
    expect(verifyArtifactDir(dir)).toEqual([expect.stringMatching(/build-info\.json is missing/)]);
  });

  it('rejects malformed build-info.json and missing directories', () => {
    expect(verifyArtifactDir(buildDir({ 'build-info.json': '{oops', 'a.js': PROD_JS }))).toEqual([expect.stringMatching(/not valid JSON/)]);
    expect(verifyArtifactDir(join(tmpdir(), 'algoflow-does-not-exist-123'))).toEqual([expect.stringMatching(/not found/)]);
  });
});
