import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Architekturregeln als Tests: Jede Regel schützt eine Entscheidung, die sich sonst unbemerkt aushebeln ließe,
 * etwa Plotly wieder im Startpaket oder Angular im Web Worker. Geprüft werden die Importe aller Quelldateien.
 */

interface Import {
  /** Wie im Quelltext, z. B. '@angular/core' oder '../plan-store'. */
  specifier: string;
  /** Aufgelöste Datei relativ zu src/, bei Paketen null. */
  target: string | null;
  /** import('…'): wird erst bei Bedarf geladen. */
  dynamic: boolean;
}

interface SourceFile {
  /** Relativ zu src/, z. B. 'app/stores/plan-store.ts'. */
  path: string;
  content: string;
  imports: Import[];
}

const SRC: string = resolve('src');

function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) {
      // Hilfen für Tests gehören nicht zur App
      return name === 'testing' ? [] : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== 'test-setup.ts' ? [path] : [];
  });
}

/** Die erste Gruppe jedes Treffers; das Muster muss eine haben. */
function firstGroups(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)].map((match: RegExpExecArray): string => match[1] ?? '');
}

function parse(path: string): SourceFile {
  const content: string = readFileSync(path, 'utf8');
  const resolveTarget = (specifier: string): string | null =>
    specifier.startsWith('.') ? relative(SRC, resolve(dirname(path), specifier)) + '.ts' : null;
  const imports: Import[] = [];
  // Auch mehrzeilige Importe: alles von „import“/„export“ bis zum nächsten „from '…'“
  for (const specifier of firstGroups(content, /^[ \t]*(?:import|export)\b[^;']*\bfrom[ \t]+'([^']+)'/gm)) {
    imports.push({specifier, target: resolveTarget(specifier), dynamic: false});
  }
  // Nur für den Seiteneffekt, ohne „from“: import 'plotly.js-dist-min';
  for (const specifier of firstGroups(content, /^[ \t]*import[ \t]+'([^']+)'/gm)) {
    imports.push({specifier, target: resolveTarget(specifier), dynamic: false});
  }
  for (const specifier of firstGroups(content, /\bimport\(\s*'([^']+)'\s*\)/g)) {
    imports.push({specifier, target: resolveTarget(specifier), dynamic: true});
  }
  return {path: relative(SRC, path), content, imports};
}

const files: SourceFile[] = sourceFiles().map(parse);
const file = (path: string): SourceFile => files.find((source: SourceFile): boolean => source.path === path)!;
const isPackage = (specifier: string, ...packages: string[]): boolean =>
  packages.some((name: string): boolean => specifier === name || specifier.startsWith(`${name}/`));
const isComponent = (source: SourceFile): boolean => source.content.includes('@Component(');
const isService = (source: SourceFile): boolean => source.content.includes('@Injectable(');
/** Verstöße als lesbare Zeilen, damit eine fehlschlagende Regel sofort sagt, wo. */
const show = (source: SourceFile, what: string): string => `${source.path} → ${what}`;

describe('architecture', () => {
  it('finds the source files and their imports', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(file('app/stores/plan-store.ts').imports.map((i: Import): string => i.specifier)).toContain('@angular/core');
  });

  it('resolves every relative import to an existing file', () => {
    const paths = new Set<string>(files.map((source: SourceFile): string => source.path));
    const broken: string[] = files.flatMap((source: SourceFile): string[] => source.imports
      .filter((i: Import): boolean => i.target !== null && !paths.has(i.target))
      .map((i: Import): string => show(source, i.specifier)));

    expect(broken).toEqual([]);
  });

  it('keeps the calculation core free of Angular and of anything outside it, because it runs in the web worker', () => {
    const allowed = (target: string): boolean => target.startsWith('app/calculation/');
    const violations: string[] = files
      .filter((source: SourceFile): boolean => source.path.startsWith('app/calculation/'))
      .flatMap((source: SourceFile): string[] => source.imports
        .filter((i: Import): boolean => i.target === null || !allowed(i.target))
        .map((i: Import): string => show(source, i.specifier)));

    expect(violations).toEqual([]);
  });

  it('imports Plotly only in the charts, which load on demand', () => {
    const violations: string[] = files
      .filter((source: SourceFile): boolean => !source.path.startsWith('app/charts/'))
      .flatMap((source: SourceFile): string[] => source.imports
        .filter((i: Import): boolean => isPackage(i.specifier, 'plotly.js-dist-min', 'angular-plotly.js'))
        .map((i: Import): string => show(source, i.specifier)));

    expect(violations).toEqual([]);
  });

  it('lets only the account panel use the charts, where they sit behind @defer', () => {
    const violations: string[] = files
      .filter((source: SourceFile): boolean => !source.path.startsWith('app/charts/') && source.path !== 'app/account-panel/account-panel.ts')
      .flatMap((source: SourceFile): string[] => source.imports
        .filter((i: Import): boolean => i.target?.startsWith('app/charts/') ?? false)
        .map((i: Import): string => show(source, i.specifier)));

    expect(violations).toEqual([]);
  });

  it('imports jsPDF only in the PDF layout, and loads that only on demand', () => {
    const jspdf: string[] = files
      .filter((source: SourceFile): boolean => source.path !== 'app/pdf/pdf-layout.ts')
      .flatMap((source: SourceFile): string[] => source.imports
        .filter((i: Import): boolean => isPackage(i.specifier, 'jspdf', 'jspdf-autotable'))
        .map((i: Import): string => show(source, i.specifier)));
    const staticLayout: string[] = files.flatMap((source: SourceFile): string[] => source.imports
      .filter((i: Import): boolean => i.target === 'app/pdf/pdf-layout.ts' && !i.dynamic)
      .map((i: Import): string => show(source, i.specifier)));

    expect(jspdf).toEqual([]);
    expect(staticLayout).toEqual([]);
  });

  it('keeps services independent of components', () => {
    const components = new Set<string>(files.filter(isComponent).map((source: SourceFile): string => source.path));
    const violations: string[] = files
      .filter((source: SourceFile): boolean => isService(source) && !isComponent(source))
      .flatMap((source: SourceFile): string[] => source.imports
        .filter((i: Import): boolean => i.target !== null && components.has(i.target))
        .map((i: Import): string => show(source, i.specifier)));

    expect(violations).toEqual([]);
  });

  it('has no import cycles', () => {
    const edges = new Map<string, string[]>(files.map((source: SourceFile): [string, string[]] => [source.path,
      source.imports
        .filter((i: Import): boolean => i.target !== null && !i.dynamic)
        .map((i: Import): string => i.target!)]));
    const cycles: string[] = [];
    const done = new Set<string>();
    const visit = (path: string, trail: string[]): void => {
      if (trail.includes(path)) {
        cycles.push([...trail.slice(trail.indexOf(path)), path].join(' → '));
        return;
      }
      if (done.has(path)) {
        return;
      }
      for (const next of edges.get(path) ?? []) {
        visit(next, [...trail, path]);
      }
      done.add(path);
    };
    files.forEach((source: SourceFile): void => visit(source.path, []));

    expect(cycles).toEqual([]);
  });

  it('lets only the plan store change the model, so that every change is counted and saved', () => {
    const mutators: string = 'setTitle|setAmount|setName|setCity|setGroupSize|addModifier|removeModifier|addCity|removeCity';
    // Erlaubte Empfänger: der Store selbst und Angulars Title-Service, der ebenfalls setTitle heißt
    const receivers: string[] = ['store', 'title'];
    const violations: string[] = files
      .filter((source: SourceFile): boolean => !source.path.startsWith('app/calculation/') && source.path !== 'app/stores/plan-store.ts')
      .flatMap((source: SourceFile): string[] => [...source.content.matchAll(new RegExp(`\\b(\\w+)\\.(${mutators})\\(`, 'g'))]
        .filter(([, receiver]: RegExpMatchArray): boolean => !receivers.includes(receiver ?? ''))
        .map(([call]: RegExpMatchArray): string => show(source, call)));

    expect(violations).toEqual([]);
  });

  it('leaves the browser storage to the stores, through storage.ts', () => {
    const stores: string[] = ['app/stores/plan-store.ts', 'app/stores/theme-store.ts', 'app/stores/language-store.ts'];
    const direct: string[] = files
      .filter((source: SourceFile): boolean =>
        source.path !== 'app/stores/storage.ts' && /\blocalStorage\b/.test(source.content))
      .map((source: SourceFile): string => show(source, 'localStorage'));
    const users: string[] = files
      .filter((source: SourceFile): boolean => !stores.includes(source.path) && source.imports
        .some((imported: Import): boolean => imported.target === 'app/stores/storage.ts'))
      .map((source: SourceFile): string => show(source, 'storage.ts'));

    expect(direct).toEqual([]);
    expect(users).toEqual([]);
  });

  it('injects dependencies with inject() instead of constructor parameters', () => {
    // Jede Klasse reicht von ihrer Deklaration bis zur nächsten; dekoriert ist sie, wenn ein Angular-Decorator davor steht
    const classes = (source: SourceFile): {name: string, body: string, decorated: boolean}[] => {
      const starts: RegExpMatchArray[] = [...source.content.matchAll(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm)];
      return starts.map((start: RegExpMatchArray, index: number) => {
        const before: string = source.content.slice(starts[index - 1]?.index ?? 0, start.index);
        return {
          name: start[1] ?? '',
          body: source.content.slice(start.index, starts[index + 1]?.index),
          decorated: /@(?:Component|Directive|Pipe|Injectable|NgModule)\(/.test(before),
        };
      });
    };
    const decorated = files.flatMap((source: SourceFile) => classes(source)
      .filter(({decorated}): boolean => decorated)
      .map((entry) => ({source, ...entry})));
    const violations: string[] = decorated
      .filter(({body}): boolean => /\bconstructor\s*\(\s*[^)\s]/.test(body))
      .map(({source, name}): string => show(source, name));

    expect(decorated.length).toBeGreaterThan(5);
    expect(violations).toEqual([]);
  });

  it('asks media queries through the CDK, which also works without a browser', () => {
    const violations: string[] = files
      .filter((source: SourceFile): boolean => /(?<![.\w])matchMedia\(|window\.matchMedia/.test(source.content))
      .map((source: SourceFile): string => show(source, 'matchMedia'));

    expect(violations).toEqual([]);
  });
});
