// Notes on entries: optional free text, from a few words ("felt tired", "new
// record") to a longer passage. Short ones show in full under an entry; long
// ones show a preview and open in a sheet.

export const MAX_NOTE_LENGTH = 2000;
export const MAX_NOTE_SUGGESTIONS = 6;
/** A note longer than this (or with several lines) is previewed, with "Show all". */
export const NOTE_PREVIEW_LENGTH = 80;
/** Longer notes are not offered as quick chips: a chip is a few words. */
export const MAX_CHIP_LENGTH = 40;

/**
 * Trims, collapses runs of spaces within a line, keeps line breaks (at most one blank line in a row)
 * and caps the length; empty becomes null.
 */
export function normalizeNote(text: string | null | undefined): string | null {
  const note = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_NOTE_LENGTH)
    .trim();
  return note === '' ? null : note;
}

/** Whether a note is shown as a preview with "Show all" instead of in full. */
export function isLongNote(note: string): boolean {
  return note.length > NOTE_PREVIEW_LENGTH || note.includes('\n');
}

/**
 * Quick chips: the user's recent notes first (newest first), then the built-in
 * suggestions, without case-insensitive duplicates. Long notes are skipped.
 */
export function noteSuggestions(
  recent: readonly string[],
  defaults: readonly string[],
  limit = MAX_NOTE_SUGGESTIONS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...recent, ...defaults]) {
    const note = normalizeNote(raw);
    if (note === null || note.length > MAX_CHIP_LENGTH || note.includes('\n')) continue;
    const key = note.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
    if (out.length === limit) break;
  }
  return out;
}
