export type Build = 'none' | 'building' | 'ready' | 'failed';

export type Draft = {
  name: string;
  refId: string;
  author: string | undefined;
  savedAt: string | undefined;
  // Keystatic's commit headline, e.g. "Update src/content/docs/help/x".
  lastSave?: string;
  build: Build;
  checks: Build;
  alias: string;
  failureUrl: string | undefined;
  pr: { id: string; number: number; queued: boolean } | undefined;
};

export type DraftStatus = 'building' | 'ready' | 'failed' | 'publishing';

// `undefined` is a draft saved moments ago that GitHub has not listed yet.
export function draftStatus(draft: Draft | undefined): DraftStatus {
  if (!draft) return 'building';
  if (draft.pr?.queued) {
    return draft.checks === 'failed' ? 'failed' : 'publishing';
  }
  if (draft.build === 'failed') return 'failed';
  if (draft.build === 'ready') return 'ready';
  return 'building';
}

export const statusLabel: Record<DraftStatus, string> = {
  building: 'Building',
  ready: 'Ready',
  failed: 'Needs a fix',
  publishing: 'Publishing',
};

// `draft/void-a-bill-2` → "Void a bill 2"
export function draftTitle(branch: string, prefix: string) {
  const words = (
    branch.startsWith(prefix) ? branch.slice(prefix.length) : branch
  )
    .replace(/[-_/]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : branch;
}

export function savedAgo(iso: string | undefined, now: number) {
  if (!iso) return 'Saved just now';
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'Saved just now';
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days} ${days === 1 ? 'day' : 'days'} ago`;
}
