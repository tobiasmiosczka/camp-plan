/** Bietet eine Datei zum Herunterladen an. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Dateiname aus Projektname und Datum, z. B. „sommerlager-2027-2026-10-09.pdf“; ohne Namen „camp-plan-…“. */
export function fileName(projectName: string, extension: string): string {
  const slug: string = projectName
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${shorten(slug, 60) || 'camp-plan'}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

/** Kürzt lange Namen an einer Wortgrenze, damit Dateinamen handlich bleiben; ohne Wortgrenze hart. */
function shorten(slug: string, max: number): string {
  if (slug.length <= max) {
    return slug;
  }
  const boundary: number = slug.lastIndexOf('-', max);
  return slug.slice(0, boundary > 0 ? boundary : max);
}
