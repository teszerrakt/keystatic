import { ChangeKind, humanize } from './review';

export type Language = { language: string; collection: string; dir: string };

export type DraftState = 'new' | 'edited' | 'deleted';

export type PageRow = {
  slug: string;
  title: string;
  // The first language that has the page; "Edit" opens it.
  collection: string;
  languages: string[];
  missing: string[];
  section: string | undefined;
  updated: string | undefined;
  draft: DraftState | undefined;
  changedLanguages: string[];
  // Collections where this draft deletes the page; Undo restores these.
  deletedIn: string[];
};

export function buildPageRows(input: {
  languages: Language[];
  slugs: Map<string, Set<string>>;
  // In a draft: the base branch's pages, so deleted pages still show.
  baseSlugs?: Map<string, Set<string>>;
  changes?: { collection: string; slug: string; kind: ChangeKind }[];
  title: (collection: string, slug: string) => string | undefined;
  section: (collection: string, slug: string) => string | undefined;
  updated: (collection: string, slug: string) => string | undefined;
}): PageRow[] {
  const all = new Set<string>();
  for (const l of input.languages) {
    for (const s of input.slugs.get(l.collection) ?? []) all.add(s);
    for (const s of input.baseSlugs?.get(l.collection) ?? []) all.add(s);
  }
  const rows: PageRow[] = [];
  for (const slug of all) {
    const present = input.languages.filter(
      l => input.slugs.get(l.collection)?.has(slug)
    );
    const changes = (input.changes ?? []).filter(c => c.slug === slug);
    const changeIn = (kind: ChangeKind) =>
      changes.filter(c => c.kind === kind).map(c => c.collection);
    const deletedIn = changeIn('removed');
    const first =
      present[0] ??
      input.languages.find(l => deletedIn.includes(l.collection))!;
    const isNew =
      changeIn('added').length > 0 &&
      present.every(l => changeIn('added').includes(l.collection));
    const draft: DraftState | undefined = !present.length
      ? 'deleted'
      : isNew
      ? 'new'
      : changes.length
      ? 'edited'
      : undefined;
    const updatedAll = present
      .map(l => input.updated(l.collection, slug))
      .filter((d): d is string => !!d)
      .sort();
    rows.push({
      slug,
      title: input.title(first.collection, slug) ?? humanize(slug),
      collection: first.collection,
      languages: present.map(l => l.language),
      missing: input.languages
        .filter(l => !present.includes(l))
        .map(l => l.language),
      section: input.section(first.collection, slug),
      updated: updatedAll[updatedAll.length - 1],
      draft,
      changedLanguages: input.languages
        .filter(l => changes.some(c => c.collection === l.collection))
        .map(l => l.language),
      deletedIn,
    });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

// Keystatic writes "Update <path>" / "Delete <path>" for every save.
export function pageFromCommit(
  message: string | undefined,
  languages: Language[]
) {
  const m = message?.match(/^(Update|Delete) (.+)$/m);
  if (!m) return undefined;
  for (const l of languages) {
    if (!m[2].startsWith(`${l.dir}/`)) continue;
    const slug = m[2]
      .slice(l.dir.length + 1)
      .split('/')[0]
      .replace(/\.[^.]+$/, '');
    if (slug) {
      return { collection: l.collection, slug, deleted: m[1] === 'Delete' };
    }
  }
  return undefined;
}

export function ago(iso: string | undefined, now: number) {
  if (!iso) return '';
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  return `${Math.floor(days / 30)} months ago`;
}

export const capitalize = (s: string) =>
  s ? s[0].toUpperCase() + s.slice(1) : s;

export function frontmatterField(text: string, field: string) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const value = front
    ?.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1]
    .trim();
  return value?.replace(/^(['"])(.*)\1$/, '$2') || undefined;
}
