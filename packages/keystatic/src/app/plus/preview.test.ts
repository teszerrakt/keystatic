import { expect, test } from 'vitest';

import { collection, config, Config } from '../../config';
import { fields } from '../../form/api';
import { previewHrefFor } from './draft-data';
import type { Draft } from './draft-status';
import {
  autoPreview,
  cloudflarePreview,
  githubDeploymentsPreview,
  PreviewPlugin,
  previewPlugin,
  PreviewSignals,
} from './preview';

const branch = 'draft/lorem-ipsum';
const workers = (status: string, conclusion: string | null) => ({
  name: 'Workers Builds: docs',
  status,
  conclusion,
  detailsUrl:
    'https://dash.cloudflare.com/x/workers/services/view/docs/production/builds/1/previews/draft-lorem-ipsum/',
});
const deployment = (
  state: string | null,
  createdAt = '2026-10-14T10:00:00Z'
) => ({
  environment: 'Preview',
  createdAt,
  state,
  environmentUrl: `https://sandbox-${state?.toLowerCase()}.vercel.app`,
  logUrl: 'https://vercel.com/team/sandbox/logs',
});
const signals = (s: Partial<PreviewSignals>): PreviewSignals => ({
  branch,
  checkRuns: [],
  deployments: [],
  ...s,
});

test('Cloudflare: Workers Builds check runs, alias from the build', () => {
  const read = cloudflarePreview().read;
  expect(
    read(signals({ checkRuns: [workers('IN_PROGRESS', null)] }))
  ).toMatchObject({
    build: 'building',
    alias: 'draft-lorem-ipsum',
  });
  expect(
    read(signals({ checkRuns: [workers('COMPLETED', 'SUCCESS')] })).build
  ).toBe('ready');
  expect(
    read(signals({ checkRuns: [workers('COMPLETED', 'FAILURE')] }))
  ).toMatchObject({
    build: 'failed',
    failureUrl: expect.stringContaining('dash.cloudflare.com'),
  });
  expect(read(signals({})).build).toBe('none');
});

test('deployments: the newest preview deployment gives the state and its own address', () => {
  const read = githubDeploymentsPreview().read;
  expect(read(signals({ deployments: [deployment(null)] })).build).toBe(
    'building'
  );
  expect(
    read(signals({ deployments: [deployment('IN_PROGRESS')] })).build
  ).toBe('building');
  expect(
    read(
      signals({
        deployments: [
          deployment('FAILURE', '2026-10-14T09:00:00Z'),
          deployment('SUCCESS', '2026-10-14T10:00:00Z'),
        ],
      })
    )
  ).toEqual({
    build: 'ready',
    url: 'https://sandbox-success.vercel.app',
    alias: 'draft-lorem-ipsum',
    failureUrl: undefined,
  });
  expect(read(signals({ deployments: [deployment('ERROR')] }))).toMatchObject({
    build: 'failed',
    failureUrl: 'https://vercel.com/team/sandbox/logs',
  });
  const production = { ...deployment('SUCCESS'), environment: 'Production' };
  expect(read(signals({ deployments: [production] })).build).toBe('none');
});

test('auto: Cloudflare when its check runs are there, else deployments', () => {
  const read = autoPreview().read;
  expect(
    read(
      signals({
        checkRuns: [workers('COMPLETED', 'SUCCESS')],
        deployments: [deployment('IN_PROGRESS')],
      })
    ).build
  ).toBe('ready');
  expect(read(signals({ deployments: [deployment('SUCCESS')] })).url).toBe(
    'https://sandbox-success.vercel.app'
  );
});

test('a site can plug in its own provider', () => {
  const custom: PreviewPlugin = {
    id: 'custom',
    read: s => ({
      build: 'ready',
      url: `https://${s.branch.replace('/', '--')}.example.com`,
    }),
  };
  const github = { kind: 'github', repo: 'o/r' } as const;
  expect(
    previewPlugin(config({ storage: { ...github, preview: custom } }).storage)
      .id
  ).toBe('custom');
  expect(previewPlugin(config({ storage: github }).storage).id).toBe('auto');
});

test('a reported address replaces the pattern host and keeps the page path', () => {
  const site: Config = {
    storage: {
      kind: 'github',
      repo: 'o/r',
      drafts: true,
      draftPreviewUrl: 'https://p-git-{alias}-team.vercel.app',
    },
    collections: {
      docs: collection({
        label: 'Docs',
        path: 'docs/*',
        slugField: 'title',
        previewUrl: 'https://p-git-{alias}-team.vercel.app/help/{slug}/',
        schema: { title: fields.slug({ name: { label: 'Title' } }) },
      }),
    },
  };
  const draft: Draft = {
    name: branch,
    refId: 'r',
    author: undefined,
    savedAt: undefined,
    build: 'ready',
    checks: 'ready',
    alias: 'draft-lorem-ipsum',
    failureUrl: undefined,
    pr: undefined,
  };
  const params = [
    'branch',
    branch,
    'collection',
    'docs',
    'item',
    'lorem-ipsum',
  ];
  expect(
    previewHrefFor(
      site,
      { ...draft, previewUrl: 'https://p-abc123-team.vercel.app/' },
      params
    )
  ).toBe('https://p-abc123-team.vercel.app/help/lorem-ipsum/');
  expect(previewHrefFor(site, draft, params)).toBe(
    'https://p-git-draft-lorem-ipsum-team.vercel.app/help/lorem-ipsum/'
  );
});
