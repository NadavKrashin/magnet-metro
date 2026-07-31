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

const out = `<title>Magnet Metro — mechanic test</title>
<style>
${css}
</style>
${markup}
<script type="module">
${js}
</script>
`;

writeFileSync(outPath, out, "utf8");
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} kB)`);
