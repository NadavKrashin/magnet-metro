/**
 * Builds the single-file game and copies it into docs/, which is what GitHub Pages serves.
 *
 * The hosted build is not decoration. It is the landing page every share link opens, the thing
 * posted to communities (people play in three seconds instead of installing), and the domain
 * that app-ads.txt and the privacy policy live on. A stale copy of it is worse than none,
 * because the link people share is the one they judge the game by — so this is one command
 * rather than a manual copy anybody could forget.
 *
 * Usage: npm run web
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const standalone = join(root, "dist", "standalone.html");

console.log("Building the single-file game…");
execFileSync("node", [join(root, "scripts", "inline.mjs")], { stdio: "inherit", cwd: root });

if (!existsSync(standalone)) {
  throw new Error("dist/standalone.html was not produced — run `npm run build` first.");
}

mkdirSync(docs, { recursive: true });

// The game itself becomes the site's index, so the bare domain is playable and every share
// link resolves without a path.
const html = readFileSync(standalone, "utf8");
writeFileSync(join(docs, "index.html"), html, "utf8");

// Jekyll is GitHub Pages' default processor and it ignores files and folders beginning with an
// underscore. Nothing here starts with one today, but a build output that silently loses a
// file is exactly the sort of thing nobody notices until the page is broken in public.
writeFileSync(join(docs, ".nojekyll"), "", "utf8");

for (const asset of ["favicon.svg", "manifest.webmanifest"]) {
  const from = join(root, "public", asset);
  if (existsSync(from)) copyFileSync(from, join(docs, asset));
}
mkdirSync(join(docs, "icons"), { recursive: true });
for (const icon of ["icon-192.webp", "icon-512.webp"]) {
  const from = join(root, "public", "icons", icon);
  if (existsSync(from)) copyFileSync(from, join(docs, "icons", icon));
}

const kb = (statSync(join(docs, "index.html")).size / 1024).toFixed(1);
console.log(`\nWrote docs/index.html (${kb} kB)`);
console.log("docs/ is ready to serve. Remaining manual steps:");
console.log("  1. GitHub → Settings → Pages → Source: main branch, /docs folder");
console.log("  2. Fill in the placeholders in docs/privacy.html");
console.log("  3. Put your AdMob publisher ID in docs/app-ads.txt");
console.log("  4. Set SHARE_BASE_URL in src/analytics/config.ts to the published URL");
