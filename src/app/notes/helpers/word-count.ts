export function wordCount(text: string) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
