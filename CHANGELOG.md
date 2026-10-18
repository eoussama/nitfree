# Changelog

Notable changes to Nitfree, newest first. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Adding, editing and deleting library items from the panel: Add Files, drag and drop or paste open a dialog styled like Discord's modals, with a name, type, tags and description per file; right-click or the menu key on an item opens a menu to favorite, edit or delete it; deleting hides the item at once, with a few seconds to undo (#29).
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
- The add and edit dialog could not be typed in while Discord's picker was open, as the picker pulled focus back (#29).
- The panel's sidebar ends level with the inspector, its border running across like Discord's, and its first icon lines up with the first section; icons come from Lucide (#22).
- The chat bar button's logo is 20 px, the size of the glyphs on Discord's own buttons (#24).

## [0.2.0]

### Changed

- Rebuilt on WXT and Svelte 5, targeting Chrome, Edge, Firefox and Safari (#31).
- Every dependency at its latest version, with `@eoussama/dx` and `@eoussama/core` (#32).

## [0.1.0]

- First version, built with Vue. Kept on the `legacy` branch.
