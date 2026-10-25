/**
 * Builds the landing page into .output/site: fills in the version and the download links, and copies
 * the screenshots, the trailer and the typeface beside it. Run on each release, so the page always
 * offers the version just released.
 *
 * A browser with a store link in site/stores.json is sent to its store; one without is sent to its zip
 * in the release on GitHub.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";



const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, ".output", "site");

const DOMAIN = "nitfree.ouss.es";
const REPOSITORY = "https://github.com/eoussama/nitfree";
const BROWSERS = ["chrome", "edge", "firefox"];

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
  "media/trailer.mp4": "branding/trailer/trailer.mp4",
  "fonts/noto-sans-400.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
  "fonts/noto-sans-600.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff2",
  "fonts/noto-sans-800.woff2": "node_modules/@fontsource/noto-sans/files/noto-sans-latin-800-normal.woff2",
  "styles.css": "site/styles.css",
};

const { version } = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
const stores = JSON.parse(await fs.readFile(path.join(SITE, "stores.json"), "utf8"));

const values = { domain: DOMAIN, repository: REPOSITORY, version };

for (const browser of BROWSERS) {
  const store = stores[browser];

  values[browser] = store || `${REPOSITORY}/releases/download/v${version}/nitfree-${version}-${browser}.zip`;
  values[`${browser}Action`] = store ? "Get it for" : "Download for";
}

const template = await fs.readFile(path.join(SITE, "index.html"), "utf8");
const page = template.replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) {
    throw new Error(`site/index.html asks for "${key}", which the build does not know.`);
  }

  return values[key];
});

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, "index.html"), page);
// Keeps the custom domain when the site is published from a branch, and documents it otherwise.
await fs.writeFile(path.join(OUT, "CNAME"), `${DOMAIN}\n`);

for (const [target, source] of Object.entries(ASSETS)) {
  await fs.mkdir(path.dirname(path.join(OUT, target)), { recursive: true });
  await fs.copyFile(path.join(ROOT, source), path.join(OUT, target));
}

process.stdout.write(`Built the landing page for Nitfree ${version} in ${path.relative(ROOT, OUT)}.\n`);
