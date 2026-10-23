# Privacy Policy

_Last updated: October 23, 2026. Applies to Nitfree 0.2.0 and later._

Nitfree is a browser extension for Chrome, Edge and Firefox that keeps your own emojis, stickers, GIFs and images in a library and lets you send them on Discord. This policy explains what Nitfree stores, where it stores it, and what it sends.

**In short: Nitfree has no servers. It does not collect, sell or share your data, and it has no analytics, tracking or ads. Everything it keeps stays in your browser, on your device.**

## What Nitfree stores

All of this is kept in your browser's storage for the extension, on your device only. Nitfree does not use sync storage, so nothing is copied to your browser account or to other devices.

**Your library** (in the extension's own IndexedDB database):

- The image files you add (PNG, GIF, WebP or JPEG), and smaller copies made for sending at emoji and sticker sizes. A video you turn into a GIF (MP4 or WebM) is read on your device and never stored: only the GIF made from it is.
- What you enter for each item: its name, type (emoji, sticker, GIF or image), tags, the packs it is in, optional description, and whether it is a favorite.
- Details read from each file so the library works: size, format, width and height, whether it is animated, a hash used to spot identical files, and a small fingerprint of how each image looks, used to spot near-identical ones.
- When each item was added, last edited and last sent, and how many times it was sent, which is used for the Recent section.
- Your tags, with their names and colors.
- Your packs, with their names.

**Your settings and extension state** (in the extension's local storage):

- Your settings: emoji and sticker sending sizes, what a click on an item does, whether animated items play on hover, and whether items from your library are suggested while you type, and where.
- Your Discord theme: the color theme and accent color you picked, and your CSS snippets, with their names and whether each is on. Snippets are added to Discord's page in your browser only; what a snippet loads is up to the CSS you write.
- Discord's current theme colors and your reduced-motion preference, so the popup can match Discord's look.
- A copy of Discord's font files (gg sans), so the popup can use Discord's typeface.
- The date Nitfree was installed.

If you used an earlier version of Nitfree, its library is moved into the new database once and the old database is then deleted.

## What Nitfree reads on Discord

Nitfree runs only on `discord.com`. There it:

- Reads the page's theme (colors and the reduced-motion setting) to match Discord's look.
- Reads which font files Discord's stylesheets use for its gg sans typeface.
- Finds the chat bar and the expression picker so it can add its button and its tab.
- When you right-click in a message, reads what is under the pointer (a custom emoji, a sticker or an image: its address, name and kind) to offer **Save to Nitfree** in Discord's menu. Nothing is kept unless you save it.
- While you type in the message box, reads the current line up to the cursor, only to notice a `:name` and suggest matching items from your library. What you type is not stored or sent anywhere, and this stops when suggestions are turned off in the popup.
- Checks each key press on Discord against the shortcut that opens Nitfree (Ctrl+Alt+N unless changed in the popup). Only that combination is acted on; key presses are not stored or sent anywhere, and this stops when the shortcut is turned off.
- Reads the current page address only to check that you are still in the same channel when an item finishes preparing, so it is never sent to the wrong channel. The address is not stored.

Nitfree does not read, store or send your messages, contacts, servers, account details or any other content of your Discord account.

## What Nitfree sends

Nitfree has no server of its own, sends nothing about you anywhere, and loads no remote code.

Nitfree makes only two kinds of requests, both to Discord and both while you are on Discord:

- Discord's own font files, from `discord.com`. Discord has usually loaded them already for its own page, so the browser normally answers from its cache. They are fetched again only when Discord changes them.
- When you choose **Save to Nitfree** on an emoji, sticker or image in a message, the original file, from Discord's media servers (`cdn.discordapp.com` and `*.discordapp.net`). These are the same files Discord shows you in the message.

Nothing about you is sent with these requests beyond what the browser sends for any file Discord's page loads. The popup itself makes no requests.

When you pick an item to send, Nitfree puts the file in Discord's message box, the same way as attaching a file yourself. Discord then uploads it as part of your message. From that point the file is handled by Discord under [Discord's Privacy Policy](https://discord.com/privacy), like any other file you send.

The GitHub link in the popup opens Nitfree's repository in a new tab only when you click it.

## Permissions

| Permission | Why Nitfree needs it |
| --- | --- |
| `storage` | To keep your settings and extension state on your device. |
| Access to `discord.com` | To add the Nitfree button and panel to Discord's chat bar, and to place the items you pick in the message box. |

Nitfree asks for no other permissions. In Firefox, it declares that it collects no data.

## Your control over your data

- Edit or delete any item or tag from the Nitfree panel on Discord.
- See how much space your library uses in the popup, find and remove duplicates there, and rename or delete your packs.
- Uninstalling Nitfree removes its library and settings from your browser.
- Clearing Discord's site data does not touch your library, because it is kept in the extension's own storage, not in Discord's.

## Children

Nitfree does not knowingly collect any information from anyone, including children.

## Changes to this policy

If Nitfree ever changes what it stores or sends, this policy will be updated in the repository before that version is released, and the date at the top will change.

## Contact

Questions about this policy can be asked on the [Issues](https://github.com/eoussama/nitfree/issues) tab of Nitfree's repository.
