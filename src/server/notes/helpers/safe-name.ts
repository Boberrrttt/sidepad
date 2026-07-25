export function safeName(name: string): string {
  const base = String(name).replace(/[/\\]/g, '').replace(/\.md$/i, '').trim();
  if (!base || base === '.' || base === '..') throw new Error('bad note name');
  return base;
}
