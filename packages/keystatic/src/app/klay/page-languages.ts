import { ago, Language } from './pages';

export type LanguageStatus = 'editing' | 'current' | 'stale' | 'missing';

export type LanguageRow = Language & {
  exists: boolean;
  status: LanguageStatus;
  note: string;
};

export const statusLabel: Record<LanguageStatus, string> = {
  editing: 'Editing',
  current: 'Up to date',
  stale: 'Needs update',
  missing: 'Add translation',
};

// The first configured language is the one the others translate.
export function languageRows(input: {
  languages: Language[];
  collection: string;
  exists: Set<string>;
  // Last commit date per collection, when known.
  updated: Map<string, string>;
  now: number;
}): LanguageRow[] {
  const main = input.languages[0];
  const mainDate = main && input.updated.get(main.collection);
  return input.languages.map(l => {
    const exists = input.exists.has(l.collection);
    const isMain = l === main;
    const date = input.updated.get(l.collection);
    const stale =
      exists &&
      !isMain &&
      input.exists.has(main.collection) &&
      !!mainDate &&
      !!date &&
      mainDate > date;
    const status: LanguageStatus =
      l.collection === input.collection
        ? 'editing'
        : !exists
        ? 'missing'
        : stale
        ? 'stale'
        : 'current';
    const note = isMain
      ? 'Main language'
      : !exists
      ? input.exists.has(main.collection)
        ? `Readers see ${main.language} with a note`
        : 'Not written yet'
      : stale
      ? `${main.language} changed after this was translated`
      : date
      ? `Translated ${ago(date, input.now)}`
      : 'Translated';
    return { ...l, exists, status, note };
  });
}

export function languageMenuTitle(present: number, total: number) {
  if (present === total) {
    return `This page in ${total} ${total === 1 ? 'language' : 'languages'}`;
  }
  return `This page in ${present} of ${total} languages`;
}
