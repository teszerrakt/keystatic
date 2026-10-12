export type DeleteScope = 'all' | 'one';

// The slug is the last part of the page's address, so typing it names the page.
export function slugConfirmed(typed: string, slug: string) {
  return typed.trim() === slug;
}

// `present` lists the collections that have the page; `collection` is the one in view.
export function collectionsToDelete(input: {
  present: string[];
  collection: string;
  scope: DeleteScope;
}) {
  if (input.scope === 'one' || input.present.length <= 1) {
    return input.present.includes(input.collection) ? [input.collection] : [];
  }
  return input.present;
}

// An entry is `<dir>/<slug>.<ext>`, plus anything under `<dir>/<slug>/`.
export function filesToDelete(input: {
  paths: Iterable<string>;
  dirs: string[];
  slug: string;
}) {
  const out: string[] = [];
  for (const path of input.paths) {
    for (const dir of input.dirs) {
      const rest = path.startsWith(`${dir}/`)
        ? path.slice(dir.length + 1)
        : undefined;
      if (
        rest !== undefined &&
        (rest.startsWith(`${input.slug}/`) ||
          (rest.startsWith(`${input.slug}.`) && !rest.includes('/')))
      ) {
        out.push(path);
      }
    }
  }
  return out.sort();
}

// The draft list reads "Delete <path>" headlines (see pageFromCommit).
export function deleteMessage(paths: string[]) {
  return {
    headline: `Delete ${paths[0]}`,
    ...(paths.length > 1
      ? {
          body: paths
            .slice(1)
            .map(p => `Delete ${p}`)
            .join('\n'),
        }
      : {}),
  };
}
