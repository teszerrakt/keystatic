export type DraftChanges = {
  message: { headline: string; body?: string };
  // Full repo paths; base64 contents.
  additions: { path: string; contents: string }[];
  deletions: { path: string }[];
};

// A null sha removes the path from the base tree.
export function treeEntries(changes: DraftChanges, blobShas: string[]) {
  return [
    ...changes.additions.map((a, i) => ({
      path: a.path,
      mode: '100644',
      type: 'blob',
      sha: blobShas[i],
    })),
    ...changes.deletions.map(d => ({
      path: d.path,
      mode: '100644',
      type: 'blob',
      sha: null,
    })),
  ];
}

export function commitMessage(message: DraftChanges['message']) {
  return message.body
    ? `${message.headline}\n\n${message.body}`
    : message.headline;
}

// Builds a commit on `baseOid` without moving any branch (Git Data API).
export async function commitOnBase(input: {
  repo: string;
  token: string;
  baseOid: string;
  changes: DraftChanges;
  fetch?: typeof fetch;
}) {
  const doFetch = input.fetch ?? fetch;
  const git = async (path: string, body?: unknown) => {
    const res = await doFetch(
      `https://api.github.com/repos/${input.repo}/git/${path}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `GitHub did not save the draft: ${json.message ?? res.status}`
      );
    }
    return json as { sha: string; tree?: { sha: string } };
  };
  const base = await git(`commits/${input.baseOid}`);
  const blobs = await Promise.all(
    input.changes.additions.map(a =>
      git('blobs', { content: a.contents, encoding: 'base64' })
    )
  );
  const tree = await git('trees', {
    base_tree: base.tree!.sha,
    tree: treeEntries(
      input.changes,
      blobs.map(b => b.sha)
    ),
  });
  const commit = await git('commits', {
    message: commitMessage(input.changes.message),
    tree: tree.sha,
    parents: [input.baseOid],
  });
  return commit.sha;
}

// A save on the live site hands its changes to the dialog that starts the
// draft; the editor's follow-up save to that branch is then already done.
export function saveHandoff() {
  let staged: {
    baseOid: string;
    changes: DraftChanges;
    branch?: string;
  } | null = null;
  return {
    stage(baseOid: string, changes: DraftChanges) {
      staged = { baseOid, changes };
    },
    changesOn(baseOid: string) {
      return staged && !staged.branch && staged.baseOid === baseOid
        ? staged.changes
        : null;
    },
    committed(branch: string) {
      if (staged) staged.branch = branch;
    },
    take(branch: string) {
      const done = !!staged && staged.branch === branch;
      if (done) staged = null;
      return done;
    },
  };
}
