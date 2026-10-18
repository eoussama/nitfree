<p align="center">
  <img width="100" alt="Nitfree logo" src="./src/assets/logo.png">
</p>

<h1 align="center">Nitfree</h1>
<p align="center">The definitive freemium Discord Nitro alternative</p>

<p align="center">
  <a href="https://github.com/eoussama/nitfree/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/eoussama/nitfree/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Latest tag" src="https://img.shields.io/github/v/tag/eoussama/nitfree" />
  <img alt="License" src="https://img.shields.io/github/license/eoussama/nitfree" />
  <img alt="Code size" src="https://img.shields.io/github/languages/code-size/eoussama/nitfree" />
</p>

## Description

Nitfree is a quality of life extension that enhances your Discord experience by providing convenience when Nitro is too expensive for the pocket.

## Development

Requires Node.js 22 or later and pnpm.

```bash
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox    # Firefox with hot reload
```

| Script                                                         | Description                               |
| -------------------------------------------------------------- | ----------------------------------------- |
| `pnpm build`, `build:firefox`, `build:edge`, `build:safari`    | Production build in `.output/`            |
| `pnpm zip`, `zip:firefox`, `zip:edge`                          | Store-ready zip                           |
| `pnpm lint`, `pnpm lint:fix`                                   | Lint with `@eoussama/dx`                  |
| `pnpm typecheck`                                               | Type check TypeScript and Svelte files    |
| `pnpm test`                                                    | Unit tests with Vitest                    |
| `pnpm test:e2e`                                                | Load the Chrome build in Chromium with Playwright (run `pnpm build` and `pnpm exec playwright install chromium` first) |

The Safari build is converted into an Xcode project with `xcrun safari-web-extension-converter .output/safari-mv3` on macOS.

The previous Vue implementation lives on the `legacy` branch.

## Releasing

1. Move the `Unreleased` notes in [CHANGELOG.md](./CHANGELOG.md) under a new version heading, e.g. `## [0.3.0]`.
2. Set the same version in `package.json` and commit.
3. Tag and push: `git tag v0.3.0 && git push origin v0.3.0`.

The [release workflow](./.github/workflows/release.yml) checks the tag against `package.json`, builds the Chrome, Edge and Firefox zips (plus Firefox's sources zip) and the Safari Xcode project, and publishes them as a GitHub release with the changelog notes. Store submissions use those files and the copy in [docs/store.md](./docs/store.md).
