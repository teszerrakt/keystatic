<!-- prettier-ignore-start -->
# Keystatic Plus

A fork of [Keystatic](https://github.com/Thinkmill/keystatic), the git-based CMS by Thinkmill, that adds an editor for writers. Keystatic's core is Thinkmill's work; Plus builds on it and tracks its releases.

**Latest:** [`0.6.9-plus.1.0.0`](https://github.com/teszerrakt/keystatic/releases/tag/v0.6.9-plus.1.0.0), on Keystatic 0.6.9 · [Sandbox site](https://keystatic-plus-sandbox.vercel.app) ([source](https://github.com/teszerrakt/keystatic-plus-sandbox))

## Install

```sh
npm install @keystatic/core@npm:@teszerrakt/keystatic-core@0.6.9-plus.1.0.0
```

The `npm:` alias keeps every `@keystatic/core` import and integration (`@keystatic/astro`, `@keystatic/next`) working. It brings the fork's design system, `@teszerrakt/keystar-ui`, with it. Pin the exact version: semver ranges skip prerelease versions.

With pnpm's `minimumReleaseAge`, add both packages to `minimumReleaseAgeExclude` so a new release installs the day it ships.

Everything in [Keystatic's docs](https://keystatic.com/docs/introduction) still applies. The sections below cover what Plus adds.

## What Plus adds

These apply to GitHub storage. Local storage keeps Keystatic's own editor.

### An editor for writers

- **Home:** your drafts, shortcuts to start or edit a page, and what was published recently.
- **Pages:** one list across every language, with each page's languages and which ones are missing or stale.
- **Page languages:** collections grouped by language in `ui.navigation` are treated as one page in several languages.
- **Menu sections:** writers edit the docs menu's sections, and place a page in the menu from the page itself.
- **Delete a page** in this language or every language, with a warning about pages that link to it.

```ts
import { fields } from '@keystatic/core';

const menuFields = {
  section: fields.menuSection({
    label: 'Menu section',
    singleton: 'menuSections',
    defaultValue: 'getting-started',
  }),
  sidebar: fields.object({
    order: fields.menuOrder({ label: 'Place in the menu' }),
  }),
};
```

### An image library

`library: true` on a content field's image option turns on the **Images** page: every picture in the folder, where each is used, uploads, replace, remove with Undo and default alt text. Writers embed a library picture by reference instead of copying it into the page's folder.

```ts
content: fields.markdoc({
  label: 'Content',
  options: {
    image: {
      directory: 'src/assets/images/docs',
      publicPath: '../../assets/images/docs/',
      library: true,
    },
  },
}),
```

### Drafts, or saves that go live at once

`storage.drafts` picks how saving works.

- **On:** every save goes into a draft branch. A draft bar follows it through saving, building the preview and publishing. **Review & publish** lists every change and checks links; **Publish now** ships a one-page fix in one step. Publishing merges the draft's pull request once the repository's required checks pass.
- **Off (default):** every save goes live at once, and the save button reads **Publish**.

```ts
storage: {
  kind: 'github',
  repo: 'owner/site',
  drafts: true,
  branchPrefix: 'draft/',
  draftPreviewUrl: 'https://{alias}.preview.example.com', // {alias}: draft/a-page → draft-a-page
  siteUrl: 'https://example.com',
},
```

### Draft previews from your host

`storage.preview` reads a draft's build from GitHub. The default, `autoPreview()`, uses Cloudflare Workers Builds check runs when they are there, else GitHub deployments (Vercel, Netlify and most hosts), whose own address replaces the `draftPreviewUrl` pattern. Pass `cloudflarePreview()`, `githubDeploymentsPreview()` or your own plug-in to choose.

```ts
import { githubDeploymentsPreview } from '@keystatic/core';

storage: {
  kind: 'github',
  repo: 'owner/site',
  drafts: true,
  preview: githubDeploymentsPreview(),
},
```

### Sign-in plug-in

`storage.auth` swaps GitHub sign-in for your own, for example a company login whose server holds the GitHub App. It defaults to `githubAuth()`.

## Versions

Versions read `<upstream version>-plus.<major>.<minor>.<patch>`. The base is the Keystatic release Plus is built on; the part after `-plus.` follows semver for the fork's own changes, so a breaking Plus change bumps its major. Each release's notes are on [GitHub Releases](https://github.com/teszerrakt/keystatic/releases).

## Developing

You need Node.js 24 and pnpm 11 ([corepack](https://nodejs.org/api/corepack.html) picks the right pnpm).

```sh
pnpm install
pnpm build:packages
pnpm test
```

- `plus` is the fork's branch; `main` mirrors Thinkmill's `main`, and upstream releases merge from there into `plus`.
- Fork code lives in `packages/keystatic/src/app/plus/`; upstream files only get small hooks, so upstream merges stay small.
- Every pull request publishes a build to [pkg.pr.new](https://pkg.pr.new). Every pull request also shows proof of the change working: see [`AGENTS.md`](AGENTS.md).
- `node scripts/plus-pack.mjs <version>` packs a release of both packages.

## License

MIT, as upstream. Keystatic is copyright (c) 2023 [Thinkmill Labs](https://www.thinkmill.com.au/labs) Pty Ltd. See [`LICENSE`](LICENSE).
<!-- prettier-ignore-end -->
