export type ChangeKind = 'added' | 'changed' | 'removed';
export type PageChange = { collection: string; slug: string; kind: ChangeKind };
export type FileChange = { path: string; kind: ChangeKind };

export type Row = {
  key: string;
  title: string;
  detail: string;
  // The page to open in the editor; absent for deleted pages and files.
  page?: { collection: string; slug: string };
};
export type GroupKey = 'new' | 'edited' | 'deleted' | 'pictures' | 'other';
export type Group = {
  key: GroupKey;
  label: string;
  short: string;
  rows: Row[];
};

const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export function humanize(name: string) {
  const words = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

type Entry = { sha: string; type?: string };

// Folders change whenever a file inside does; only files count.
export function diffEntries(
  current: Map<string, Entry>,
  base: Map<string, Entry>
): FileChange[] {
  const out: FileChange[] = [];
  for (const [path, entry] of current) {
    if (entry.type === 'tree') continue;
    const before = base.get(path);
    if (!before) out.push({ path, kind: 'added' });
    else if (before.sha !== entry.sha) out.push({ path, kind: 'changed' });
  }
  for (const [path, entry] of base) {
    if (entry.type === 'tree') continue;
    if (!current.has(path)) out.push({ path, kind: 'removed' });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function languageList(languages: string[]) {
  return languages.length <= 1
    ? languages[0] ?? ''
    : `${languages[0]} +${languages.length - 1}`;
}

// One row per page and kind: a page that is new in two languages is one row.
export function groupChanges(input: {
  pages: PageChange[];
  files: FileChange[];
  language: (collection: string) => string;
  title: (change: PageChange) => string;
}): Group[] {
  const pageGroups: [GroupKey, ChangeKind, string, string][] = [
    ['new', 'added', 'New pages', 'new'],
    ['edited', 'changed', 'Edited pages', 'edited'],
    ['deleted', 'removed', 'Deleted pages', 'deleted'],
  ];
  const groups: Group[] = pageGroups.map(([key, kind, label, short]) => {
    const bySlug = new Map<string, PageChange[]>();
    for (const p of input.pages) {
      if (p.kind !== kind) continue;
      bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p]);
    }
    const rows = [...bySlug].map(([slug, changes]) => ({
      key: `${key}:${slug}`,
      title: input.title(changes[0]),
      detail: languageList(changes.map(c => input.language(c.collection))),
      page:
        kind === 'removed'
          ? undefined
          : { collection: changes[0].collection, slug },
    }));
    return { key, label, short, rows };
  });

  const fileRow = (f: FileChange): Row => {
    const parts = f.path.split('/');
    const folder = parts.length > 1 ? parts[parts.length - 2] : '';
    const state = { added: 'New', changed: 'Changed', removed: 'Deleted' }[
      f.kind
    ];
    return {
      key: `file:${f.path}`,
      title: humanize(parts[parts.length - 1]),
      detail: PICTURE.test(f.path)
        ? folder
          ? `${state} · ${humanize(folder)}`
          : state
        : `${state} · ${f.path}`,
    };
  };
  const pictures = input.files.filter(f => PICTURE.test(f.path));
  const other = input.files.filter(f => !PICTURE.test(f.path));
  groups.push(
    {
      key: 'pictures',
      label: 'Pictures',
      short: 'picture',
      rows: pictures.map(fileRow),
    },
    {
      key: 'other',
      label: 'Other files',
      short: 'other file',
      rows: other.map(fileRow),
    }
  );
  return groups
    .filter(g => g.rows.length)
    .map(g => ({
      ...g,
      short:
        g.key === 'pictures' || g.key === 'other'
          ? plural(g.rows.length, g.short)
          : `${g.rows.length} ${g.short}`,
    }));
}

export const totalChanges = (groups: Group[]) =>
  groups.reduce((n, g) => n + g.rows.length, 0);

// "1 page and 1 picture"
export function changeSummary(groups: Group[]) {
  const count = (keys: GroupKey[]) =>
    groups
      .filter(g => keys.includes(g.key))
      .reduce((n, g) => n + g.rows.length, 0);
  const parts = [
    [count(['new', 'edited', 'deleted']), 'page'],
    [count(['pictures']), 'picture'],
    [count(['other']), 'other file'],
  ]
    .filter(([n]) => n)
    .map(([n, word]) => plural(n as number, word as string));
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function frontmatterTitle(text: string) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const title = front?.match(/^title:\s*(.+)$/m)?.[1].trim();
  return title?.replace(/^(['"])(.*)\1$/, '$2') || undefined;
}

export type PageText = {
  title: string;
  url: string;
  filePath: string;
  text: string;
  page: { collection: string; slug: string };
};

export type Problem = {
  from: PageText;
  kind: 'deleted-page' | 'missing-page' | 'missing-picture';
  target: string;
};

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);

function resolveFile(fromFile: string, target: string) {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

// Broken links warn and never block: the writer decides.
export function findProblems(input: {
  pages: PageText[];
  pageUrls: Set<string>;
  deletedUrls: Map<string, string>;
  prefixes: string[];
  files: Set<string>;
}): Problem[] {
  const problems: Problem[] = [];
  for (const page of input.pages) {
    const targets = [
      ...page.text.matchAll(/\]\(\s*<?([^)\s>]+)/g),
      ...page.text.matchAll(/(?:href|src)="([^"]+)"/g),
    ].map(m => m[1]);
    for (const raw of new Set(targets)) {
      const target = raw.split(/[?#]/)[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (PICTURE.test(target)) {
        if (target.startsWith('/')) continue;
        if (!input.files.has(resolveFile(page.filePath, target))) {
          problems.push({ from: page, kind: 'missing-picture', target });
        }
        continue;
      }
      let path: string;
      try {
        path = withSlash(
          decodeURI(new URL(target, `https://site${page.url}`).pathname)
        );
      } catch {
        continue;
      }
      if (!input.prefixes.some(p => path.startsWith(p))) continue;
      const deleted = input.deletedUrls.get(path);
      if (deleted) {
        problems.push({ from: page, kind: 'deleted-page', target: deleted });
      } else if (!input.pageUrls.has(path)) {
        problems.push({ from: page, kind: 'missing-page', target: path });
      }
    }
  }
  return problems;
}
