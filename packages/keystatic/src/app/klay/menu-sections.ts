import { dump, load } from 'js-yaml';

// One menu section. `label` is keyed by language name (a navigation group).
export type MenuSection = { id: string; label: Record<string, string> };

export type SectionOption = { value: string; label: string };

// The sections singleton's JSON: `{ "sections": [{ "id", "label" }] }`.
export function parseSections(text: string | undefined): MenuSection[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (data as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.flatMap((s: unknown) => {
    const item = s as { id?: unknown; label?: unknown } | null;
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) {
      return [];
    }
    seen.add(item.id);
    const label: Record<string, string> = {};
    if (item.label && typeof item.label === 'object') {
      for (const [k, v] of Object.entries(item.label)) {
        if (typeof v === 'string' && v.trim()) label[k] = v.trim();
      }
    }
    return [{ id: item.id, label }];
  });
}

// Keystatic's JSON layout; empty labels are left out, as its text field does.
export function serializeSections(
  sections: MenuSection[],
  languages: string[]
) {
  return (
    JSON.stringify(
      {
        sections: sections.map(s => {
          const keys = [
            ...languages.filter(l => l in s.label),
            ...Object.keys(s.label).filter(l => !languages.includes(l)),
          ];
          return {
            id: s.id,
            label: Object.fromEntries(
              keys.flatMap(k => (s.label[k]?.trim() ? [[k, s.label[k]]] : []))
            ),
          };
        }),
      },
      null,
      2
    ) + '\n'
  );
}

// An empty translation shows the main language's name.
export function sectionLabel(
  section: MenuSection,
  language: string,
  main: string
) {
  return section.label[language] || section.label[main] || section.id;
}

export function sectionOptions(
  sections: MenuSection[],
  main: string
): SectionOption[] {
  return sections.map(s => ({
    value: s.id,
    label: sectionLabel(s, main, main),
  }));
}

export function newSectionId(
  name: string,
  taken: { has(id: string): boolean }
) {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'section';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function moveItem<T>(list: readonly T[], from: number, to: number) {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

export function insertAt<T>(list: readonly T[], item: T, index: number) {
  const out = list.slice();
  out.splice(Math.max(0, Math.min(index, out.length)), 0, item);
  return out;
}

// Pages without an order sort as Starlight's default does in src/sidebar.mjs.
export const DEFAULT_ORDER = 100;

export type OrderRow = {
  key: string;
  title: string;
  order: number | undefined;
};

// The site's menu sorts a section's pages by order, then title.
export function compareRows(
  a: { title: string; order: number },
  b: { title: string; order: number }
) {
  return a.order - b.order || a.title.localeCompare(b.title);
}

export function sortRows<T extends { title: string; order: number }>(
  rows: readonly T[]
) {
  return rows.slice().sort(compareRows);
}

function fits(rows: OrderRow[]) {
  return rows.every(
    (r, i) =>
      r.order !== undefined &&
      (i === 0 ||
        compareRows(
          rows[i - 1] as { title: string; order: number },
          r as { title: string; order: number }
        ) < 0)
  );
}

function gap(lo: number | undefined, hi: number | undefined) {
  if (hi === undefined) return Math.floor(lo ?? 0) + 10;
  const low = lo ?? -1;
  const x = Math.floor((low + hi) / 2);
  return x > low && x < hi ? x : undefined;
}

// `rows` is the order the writer wants; returns the orders to write so the
// menu shows exactly that. Only `moving` changes when a free number fits.
export function placeOrders(rows: OrderRow[], moving: string) {
  const i = rows.findIndex(r => r.key === moving);
  if (i === -1) return new Map<string, number>();
  if (fits(rows)) return new Map<string, number>();
  const lo = rows[i - 1]?.order;
  const hi = rows[i + 1]?.order;
  // A neighbour's own number works when the title tie-break agrees.
  for (const x of [gap(lo, hi), lo, hi]) {
    if (x === undefined) continue;
    const tried = rows.map(r => (r.key === moving ? { ...r, order: x } : r));
    if (fits(tried)) return new Map([[moving, x]]);
  }
  const out = new Map<string, number>();
  rows.forEach((r, j) => {
    if (r.order !== (j + 1) * 10) out.set(r.key, (j + 1) * 10);
  });
  return out;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/;

export function readFrontmatter(text: string): Record<string, unknown> {
  const yaml = text.match(FRONTMATTER)?.[1];
  if (!yaml) return {};
  try {
    const data = load(yaml);
    return data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function frontmatterValue(text: string, path: readonly string[]) {
  let value: unknown = readFrontmatter(text);
  for (const key of path) {
    value =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[key]
        : undefined;
  }
  return value;
}

// Rewrites only the frontmatter, the way Keystatic dumps it; the body stays byte for byte.
export function withFrontmatterValue(
  text: string,
  path: readonly string[],
  value: unknown
) {
  const match = text.match(FRONTMATTER);
  const data = readFrontmatter(text);
  let node = data;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    node[key] =
      next && typeof next === 'object' && !Array.isArray(next) ? next : {};
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
  const body = match ? text.slice(match[0].length) : text;
  return `---\n${dump(data)}---\n${body}`;
}
