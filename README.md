<p align="center">
  <img width="100" alt="Nitfree logo" src="./src/assets/logo.png">
</p>

<h1 align="center">Nitfree</h1>
<p align="center">The definitive freemium Discord Nitro alternative</p>

<p align="center">
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

The Safari build is converted into an Xcode project with `xcrun safari-web-extension-converter .output/safari-mv3` on macOS.

The previous Vue implementation lives on the `legacy` branch.
