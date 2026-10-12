import { parse } from 'cookie';

// Klay fork: how the editor gets a token for GitHub. GitHub sign-in is the
// default; another plug-in (e.g. a company login whose server holds the
// GitHub App) can point `graphqlUrl` at a proxy that accepts its own token.
export type AuthPlugin = {
  id: string;
  label: string;
  /** Read synchronously before every request; null when signed out. */
  getToken(): string | null;
  /** Renews an expired token; null means the user has to sign in again. */
  refresh(): Promise<string | null>;
  /** `from` is the editor path to return to after sign-in. */
  loginUrl(from?: string): string;
  logoutUrl: string;
  graphqlUrl?: string;
};

const accessCookie = 'keystatic-gh-access-token';

export function githubAuth(): AuthPlugin {
  const read = () =>
    typeof document === 'undefined'
      ? null
      : parse(document.cookie)[accessCookie] ?? null;
  return {
    id: 'github',
    label: 'Log in with GitHub',
    getToken: read,
    async refresh() {
      const res = await fetch('/api/keystatic/github/refresh-token', {
        method: 'POST',
      });
      return res.status === 200 ? read() : null;
    },
    loginUrl: from =>
      `/api/keystatic/github/login${
        from ? `?${new URLSearchParams({ from })}` : ''
      }`,
    logoutUrl: '/api/keystatic/github/logout',
  };
}

const fallback = githubAuth();

export function authPlugin(storage: { auth?: AuthPlugin }) {
  return storage.auth ?? fallback;
}
