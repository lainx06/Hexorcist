/**
 * bench/spike-md.ts
 *
 * Replaces only the text between a marker pair in SPIKE.md.
 * If the pair is missing, the section is appended at the end of the file.
 * Everything outside the markers is left byte-for-byte as it was.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';

export function spliceSection(path: string, start: string, end: string, body: string): void {
  const text = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const block = `${start}\n${body}\n${end}`;
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  const hasStart = s !== -1;
  const hasEnd = e !== -1;

  if (hasStart !== hasEnd) {
    throw new Error(`SPIKE.md has only one of ${start} / ${end}. Fix the markers by hand.`);
  }
  if (hasStart && hasEnd) {
    if (e < s) throw new Error(`SPIKE.md has ${end} before ${start}. Fix the markers by hand.`);
    writeFileSync(path, text.slice(0, s) + block + text.slice(e + end.length), 'utf-8');
    return;
  }
  const head = text.replace(/\s*$/, '');
  writeFileSync(path, (head === '' ? '' : head + '\n\n') + block + '\n', 'utf-8');
}
