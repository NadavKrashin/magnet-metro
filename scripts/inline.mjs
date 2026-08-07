/**
 * Bundles the Vite output into one self-contained HTML file.
 *
 * Two consumers need this: the shareable prototype link (which must run with no server and
 * no external requests), and any environment with a strict content-security policy that
 * blocks separate script and style files.
 *
 * Usage: node scripts/inline.mjs [outputPath]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outPath = process.argv[2] ?? join(dist, "standalone.html");

const html = readFileSync(join(dist, "index.html"), "utf8");

const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const jsMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
if (!jsMatch) throw new Error("No script tag found in dist/index.html — did the build run?");

const readAsset = (href) => readFileSync(join(dist, href.replace(/^\.?\//, "")), "utf8");

const css = cssMatch ? readAsset(cssMatch[1]) : "";
// A literal </script> inside the bundle would close the tag early.
const js = readAsset(jsMatch[1]).replace(/<\/script/gi, "<\\/script");

const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
if (!bodyMatch) throw new Error("No <body> found in dist/index.html");
const markup = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "").trim();

// The favicon is inlined rather than linked, because "self-contained" has to survive being
// opened from a file:// path or dropped on a host with nothing else beside it.
let faviconTag = "";
try {
  const svg = readFileSync(join(root, "public", "favicon.svg"), "utf8");
  faviconTag = `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
} catch {
  // No favicon in the project. Not worth failing a build over.
}

/**
 * Social preview tags need absolute URLs, so they are only emitted once SHARE_BASE_URL names
 * a real host. A relative og:image is silently ignored by every scraper, and a card with a
 * broken image converts worse than a card with none — this is the file every shared run opens,
 * so its preview is doing real work.
 */
let shareBase = "";
try {
  const cfg = readFileSync(join(root, "src", "analytics", "config.ts"), "utf8");
  shareBase = (cfg.match(/SHARE_BASE_URL:\s*string\s*=\s*"([^"]*)"/)?.[1] ?? "").replace(/\/$/, "");
} catch {
  // Config unreadable; fall through to no social tags.
}

const TITLE = "Magnet Metro";
const DESC =
  "One tap changes your colour. Your colour feeds you — the other one kills you. " +
  "A wall of red mines is not an obstacle. It is a meal, if you are red when you reach it.";

const social = shareBase
  ? `
<meta property="og:type" content="website">
<meta property="og:site_name" content="${TITLE}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${shareBase}/">
<meta property="og:image" content="${shareBase}/social.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${shareBase}/social.png">`
  : `
<!-- Social preview tags omitted: set SHARE_BASE_URL in src/analytics/config.ts and rebuild.
     They need absolute URLs, and a card with a broken image is worse than no card. -->`;

// A complete document, not a fragment. The viewport meta in particular is not optional: this
// file is what every shared link opens, and without it a phone renders the page at desktop
// width and the first thing a new player sees is a broken layout.
const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#ede7d6">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="${DESC}">
<title>${TITLE}</title>
${faviconTag}${social}
<style>
${css}
</style>
</head>
<body>
${markup}
<script type="module">
${js}
</script>
</body>
</html>
`;

writeFileSync(outPath, out, "utf8");
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} kB)`);
