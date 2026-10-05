import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(process.cwd(), 'src');
const MOJIBAKE_MARKERS = /[ÙØÂâÃ�]/;

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        return [];
      }

      return collectSourceFiles(absolutePath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [absolutePath];
  });

const isGuardedUserFacingFile = (filePath: string) => (
  filePath.endsWith(`${sep}App.tsx`) ||
  filePath.endsWith(`${sep}types.ts`) ||
  filePath.includes(`${sep}components${sep}`) ||
  filePath.includes(`${sep}utils${sep}`)
);

describe('user-facing copy encoding', () => {
  it('keeps app, component, type, and utility files free of mojibake markers', () => {
    const offenders = collectSourceFiles(SRC_ROOT)
      .filter((filePath) => !filePath.includes(`${sep}__tests__${sep}`))
      .filter(isGuardedUserFacingFile)
      .filter((filePath) => MOJIBAKE_MARKERS.test(readFileSync(filePath, 'utf8')))
      .map((filePath) => filePath.replace(`${process.cwd()}${sep}`, ''));

    expect(offenders).toEqual([]);
  });
});
