import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Alle Dateien unter `dir` mit einer der Endungen. */
function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) {
      return files(path, extensions);
    }
    return extensions.some((extension: string): boolean => name.endsWith(extension)) && !name.endsWith('.spec.ts')
      ? [path] : [];
  });
}

describe('icon font', () => {
  const listed: string[] = /icon_names=([a-z_,]+)/.exec(readFileSync('src/index.html', 'utf8'))?.[1]?.split(',') ?? [];

  it('contains every icon the app uses', () => {
    const used = new Set<string>();
    for (const path of files('src/app', ['.html'])) {
      for (const [, name = ''] of readFileSync(path, 'utf8').matchAll(/<mat-icon[^>]*>\s*([a-z_]+)\s*<\/mat-icon>/g)) {
        used.add(name);
      }
    }
    // Icons, die erst zur Laufzeit eingesetzt werden ({{ row.icon }})
    for (const path of files('src/app', ['.ts'])) {
      for (const [, name = ''] of readFileSync(path, 'utf8').matchAll(/\bicon: '([a-z_]+)'/g)) {
        used.add(name);
      }
    }

    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((name: string): boolean => !listed.includes(name))).toEqual([]);
  });

  it('lists the icons in alphabetical order, as Google Fonts requires', () => {
    // Nach Zeichencode, nicht nach Sprache: So sortiert auch Google Fonts
    const byCodePoint = (a: string, b: string): number => Number(a > b) - Number(a < b);
    expect(listed).toEqual([...listed].sort(byCodePoint));
  });
});
