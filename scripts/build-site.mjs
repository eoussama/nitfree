/**
 * Builds the landing page into .output/site: fills in the version and the store buttons, and copies
 * the screenshots, the script and the typeface beside it. Run on each release, so the page always
 * names the version just released.
 *
 * A browser with a link in site/stores.json gets a button to its store; one without shows as coming soon.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";



const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, ".output", "site");

const DOMAIN = "nitfree.ouss.es";
const REPOSITORY = "https://github.com/eoussama/nitfree";
const TRAILER = "MtKqolyi_-Q";

/**
 * The browsers with a store, in the order their buttons show, by their key in site/stores.json.
 */
const BROWSERS = { chrome: "Chrome", edge: "Edge", firefox: "Firefox", safari: "Safari" };

/**
 * What goes beside the page, by where it ends up.
 */
const ASSETS = {
  "images/logo.png": "src/assets/logo.png",
  "images/icon-32.png": "public/icon/32.png",
  "images/icon-512.png": "public/icon/512.png",
  "images/og.png": "branding/chrome/marquee-promo-tile-1400x560.png",
  "images/panel.png": "branding/screenshots/unframed/unframed-1-panel.png",
  "images/suggest.png": "branding/screenshots/unframed/unframed-2-suggest.png",
  "images/themes.png": "branding/screenshots/unframed/unframed-3-themes.png",
  "images/save.png": "branding/screenshots/unframed/unframed-4-save.png",
  "images/video.png": "branding/screenshots/unframed/unframed-5-video.png",
  "images/trailer.png": "branding/trailer/thumbnail.png",
  "fonts/noto-sans-400.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
  "fonts/noto-sans-600.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff2",
  "fonts/noto-sans-800.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-800-normal.woff2",
  "styles.css": "site/styles.css",
  "main.js": "site/main.js",
};

const { version } = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
const stores = JSON.parse(await fs.readFile(path.join(SITE, "stores.json"), "utf8"));

function escape(text) {
  return text.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}

/**
 * One store button: a link to the store, or "coming soon" while the browser has none.
 *
 * @param {string} key - The browser's key in site/stores.json.
 * @param {string} name - The browser's name.
 * @returns {string} The button's list item.
 */
function storeButton(key, name) {
  const url = stores[key]?.trim();

  if (!url) {
    return `<li><span class="store soon" aria-disabled="true"><span class="store-label">Coming soon</span><span class="store-name">${name}</span></span></li>`;
  }

  if (!url.startsWith("https://")) {
    throw new Error(`The ${name} link in site/stores.json must start with https://.`);
  }

  return `<li><a class="store" href="${escape(url)}"><span class="store-label">Get it for</span><span class="store-name">${name}</span></a></li>`;
}

const values = {
  domain: DOMAIN,
  repository: REPOSITORY,
  version,
  trailer: TRAILER,
  stores: Object.entries(BROWSERS).map(([key, name]) => storeButton(key, name)).join("\n"),
};

const template = await fs.readFile(path.join(SITE, "index.html"), "utf8");
const page = template.replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) {
    throw new Error(`site/index.html asks for "${key}", which the build does not know.`);
  }

  return values[key];
});

// The folder is emptied rather than removed, as an editor or a local server may hold it open.
await fs.mkdir(OUT, { recursive: true });

for (const entry of await fs.readdir(OUT)) {
  await fs.rm(path.join(OUT, entry), { recursive: true, force: true });
}
await fs.writeFile(path.join(OUT, "index.html"), page);
// Keeps the custom domain when the site is published from a branch, and documents it otherwise.
await fs.writeFile(path.join(OUT, "CNAME"), `${DOMAIN}\n`);

for (const [target, source] of Object.entries(ASSETS)) {
  await fs.mkdir(path.dirname(path.join(OUT, target)), { recursive: true });
  await fs.copyFile(path.join(ROOT, source), path.join(OUT, target));
}

process.stdout.write(`Built the landing page for Nitfree ${version} in ${path.relative(ROOT, OUT)}.\n`);
