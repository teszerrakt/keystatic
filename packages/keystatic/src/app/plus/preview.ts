import type { Build } from './draft-status';

// Plus fork: how the editor learns that a draft's preview is built, and where
// it lives. Each host reports builds to GitHub its own way, so the reading is
// a plug-in; a site can write its own for a host not covered here.

export type CheckRunSignal = {
  name: string;
  status: string;
  conclusion: string | null | undefined;
  detailsUrl: string | null | undefined;
};

export type DeploymentSignal = {
  environment: string | null | undefined;
  createdAt: string;
  /** GitHub's DeploymentStatusState; missing before the host posts one. */
  state: string | null | undefined;
  environmentUrl: string | null | undefined;
  logUrl: string | null | undefined;
};

/** What GitHub knows about a draft branch's head commit. */
export type PreviewSignals = {
  branch: string;
  checkRuns: CheckRunSignal[];
  deployments: DeploymentSignal[];
};

export type PreviewState = {
  build: Build;
  /** The preview's address, e.g. `https://site-abc123.vercel.app`. */
  url?: string;
  /** Fills `{alias}` in `draftPreviewUrl` when there is no `url`. */
  alias?: string;
  failureUrl?: string;
};

export type PreviewPlugin = {
  id: string;
  read(signals: PreviewSignals): PreviewState;
};

const passed = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];

export function runState(runs: CheckRunSignal[]): Build {
  if (runs.length === 0) return 'none';
  if (runs.some(r => r.status !== 'COMPLETED')) return 'building';
  return runs.every(r => passed.includes(r.conclusion ?? ''))
    ? 'ready'
    : 'failed';
}

// Host previews name a branch the way Cloudflare does: lowercase, anything
// else becomes a dash.
export function previewAlias(branch: string) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Cloudflare Workers Builds: a `Workers Builds…` check run per build. */
export function cloudflarePreview(): PreviewPlugin {
  return {
    id: 'cloudflare',
    read({ branch, checkRuns }) {
      const runs = checkRuns.filter(r => /^Workers Builds/.test(r.name));
      const alias = runs
        .map(r => r.detailsUrl?.match(/\/previews\/([^/]+)\//)?.[1])
        .find(Boolean);
      const build = runState(runs);
      return {
        build,
        alias: alias ?? previewAlias(branch),
        failureUrl:
          build === 'failed'
            ? runs.find(r => !passed.includes(r.conclusion ?? ''))
                ?.detailsUrl ?? undefined
            : undefined,
      };
    },
  };
}

const deploymentBuild: Record<string, Build> = {
  PENDING: 'building',
  QUEUED: 'building',
  IN_PROGRESS: 'building',
  WAITING: 'building',
  SUCCESS: 'ready',
  // A newer deployment took over the environment; this one still serves.
  INACTIVE: 'ready',
  FAILURE: 'failed',
  ERROR: 'failed',
};

/**
 * GitHub deployments, which Vercel, Netlify and most hosts create per build.
 * The deployment's own address is used, so a host's shortened branch
 * hostnames (Vercel's 63-character limit) never matter.
 */
export function githubDeploymentsPreview(
  options: { environment?: RegExp } = {}
): PreviewPlugin {
  const environment = options.environment ?? /preview/i;
  return {
    id: 'github-deployments',
    read({ branch, deployments }) {
      const latest = deployments
        .filter(d => environment.test(d.environment ?? ''))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      if (!latest) return { build: 'none', alias: previewAlias(branch) };
      const build = latest.state
        ? deploymentBuild[latest.state] ?? 'building'
        : 'building';
      return {
        build,
        url: build === 'ready' ? latest.environmentUrl ?? undefined : undefined,
        alias: previewAlias(branch),
        failureUrl: build === 'failed' ? latest.logUrl ?? undefined : undefined,
      };
    },
  };
}

/** The default: Cloudflare when its check runs are there, else deployments. */
export function autoPreview(): PreviewPlugin {
  const cloudflare = cloudflarePreview();
  const deployments = githubDeploymentsPreview();
  return {
    id: 'auto',
    read(signals) {
      return signals.checkRuns.some(r => /^Workers Builds/.test(r.name))
        ? cloudflare.read(signals)
        : deployments.read(signals);
    },
  };
}

const fallback = autoPreview();

export function previewPlugin(storage: {
  kind: string;
  preview?: PreviewPlugin;
}) {
  return storage.preview ?? fallback;
}
