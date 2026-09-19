import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const authRoot = join(sourceRoot, 'features/authentication');

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('authentication storage boundary', () => {
  it('keeps browser-flow state out of Zustand and browser persistence', () => {
    for (const path of sourceFiles(authRoot)) {
      const source = readFileSync(path, 'utf8');
      expect(source, relative(sourceRoot, path)).not.toMatch(
        /(?:from\s+['"]zustand|\/stores?\/|localStorage|sessionStorage|persist\s*\()/,
      );
    }
  });

  it('keeps credentials and CSRF values out of every application store module', () => {
    const storeFiles = sourceFiles(sourceRoot).filter((path) => (
      /(?:^|\/)(?:store|stores)(?:\/|$)/.test(path)
      || /-store\.(?:ts|tsx)$/.test(path)
    ));

    expect(storeFiles.length).toBeGreaterThan(0);
    for (const path of storeFiles) {
      const source = readFileSync(path, 'utf8');
      expect(source, relative(sourceRoot, path)).not.toMatch(
        /(?:csrf(?:_token)?|session[_-]?token|password)/i,
      );
    }
  });
});
