# Changelog

Notable changes to Nitfree, newest first. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Typed messaging between the content script, popup and background worker, binary payloads included, with library and tag requests answered by the background and changes announced to open pages (#33).
- Nitfree button first in Discord's chat bar, in every composer, styled like Discord's own buttons, with a logo that blinks on hover; it opens a placeholder panel that closes on Escape or a click outside (#24).
- A Nitfree tab in Discord's expression picker, after GIFs, Stickers and Emoji, laid out and styled like Discord's emoji picker: search, a category sidebar, collapsible Favorites, Recent and All files sections, an inspector bar naming the hovered item, and full keyboard navigation. The chat bar button opens the picker on it, and falls back to a panel above the composer when the picker cannot host it (#22).
- Library database (Dexie) owned by the background worker, in the extension's own storage: items, files with cached sized copies, and tags. The previous version's library moves over on first start (#38).
- Theme engine that mirrors Discord's palette live, on Discord and in the popup, and respects reduced motion (#34).
- English and French localization (#35).
- CI: lint, typecheck, unit tests, end-to-end tests in Chromium and zips for Chrome, Edge and Firefox (#36).
- Release workflow, Firefox add-on ID and data collection declaration, store listing copy (#37).

### Changed

- `tsc` runs on TypeScript 7; TypeScript 6 stays for ESLint (#32).

### Fixed

- The 512 px icon was 1080 px wide (#37).

## [0.2.0]

### Changed

- Rebuilt on WXT and Svelte 5, targeting Chrome, Edge, Firefox and Safari (#31).
- Every dependency at its latest version, with `@eoussama/dx` and `@eoussama/core` (#32).

## [0.1.0]

- First version, built with Vue. Kept on the `legacy` branch.
