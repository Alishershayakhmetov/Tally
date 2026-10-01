// Notes on entries ("felt tired", "new record"): optional free text, short
// enough to show under an entry without wrapping into a paragraph.

export const MAX_NOTE_LENGTH = 140;
export const MAX_NOTE_SUGGESTIONS = 6;

/** Trims, collapses runs of whitespace (including newlines) and caps the length; empty becomes null. */
export function normalizeNote(text: string | null | undefined): string | null {
  const note = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH).trim();
  return note === '' ? null : note;
}

/**
 * Quick chips: the user's recent notes first (newest first), then the built-in
 * suggestions, without case-insensitive duplicates.
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
    if (note === null) continue;
    const key = note.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
    if (out.length === limit) break;
  }
  return out;
}
