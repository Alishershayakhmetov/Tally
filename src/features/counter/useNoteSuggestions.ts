import { useTranslation } from 'react-i18next';

import { useLive } from '@/db/live';
import { recentNotes } from '@/db/repos/entries';
import { noteSuggestions } from '@/domain/notes';

/** Quick chips for the note field: the user's recent notes, then the translated built-ins. */
export function useNoteSuggestions(): string[] {
  const { t } = useTranslation();
  const recent = useLive(() => recentNotes());
  const builtIn = t('notes.suggestions', { returnObjects: true }) as string[];
  return noteSuggestions(recent, builtIn);
}
