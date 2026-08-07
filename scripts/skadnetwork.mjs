/**
 * Refreshes the SKAdNetworkItems block in ios/App/App/Info.plist from Google's published list.
 *
 * WHY THIS IS A SCRIPT AND NOT A ONE-OFF PASTE
 *
 * iOS attributes installs through SKAdNetwork, and a network whose identifier is missing from
 * the plist simply does not report — so an incomplete list quietly under-reports iOS installs
 * and makes every acquisition decision look worse than it is. Google adds buyers to the list
 * over time, which means a list pasted once is wrong within months. Run this before each
 * release rather than trusting whatever is in the file.
 *
 * Usage:
 *   node scripts/skadnetwork.mjs           # fetch, show what would change
 *   node scripts/skadnetwork.mjs --write   # fetch and rewrite Info.plist
 *
 * Needs unrestricted network access to developers.google.com. If your machine cannot reach it,
 * open the page, copy the identifiers, and pass them in a file instead:
 *   node scripts/skadnetwork.mjs --from ids.txt --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plistPath = join(root, "ios", "App", "App", "Info.plist");

const SOURCES = [
  "https://developers.google.com/admob/ios/3p-skadnetworks",
  "https://developers.google.com/admob/ios/ios14",
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const fromIdx = args.indexOf("--from");
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;

/** Every string of the form abc123.skadnetwork, deduped and sorted. */
function extract(text) {
  const found = text.match(/\b[a-z0-9]{6,12}\.skadnetwork\b/gi) ?? [];
  return [...new Set(found.map((s) => s.toLowerCase()))].sort();
}

async function collect() {
  if (fromFile) {
    console.log(`Reading identifiers from ${fromFile}`);
    return extract(readFileSync(fromFile, "utf8"));
  }
  const all = new Set();
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) {
        console.warn(`  ${url} → HTTP ${res.status}, skipping`);
        continue;
      }
      const ids = extract(await res.text());
      console.log(`  ${url} → ${ids.length} identifier(s)`);
      for (const id of ids) all.add(id);
    } catch (err) {
      console.warn(`  ${url} → unreachable (${String(err).slice(0, 80)})`);
    }
  }
  return [...all].sort();
}

const ids = await collect();

// Google's own identifier must always be present; its absence means the fetch found a page
// that was not the list, and writing that to the plist would be worse than doing nothing.
if (!ids.includes("cstr6suwn9.skadnetwork")) {
  console.error(
    "\nGoogle's own identifier (cstr6suwn9.skadnetwork) was not found, so this is not the " +
      "published list — refusing to write.\n\n" +
      "Open one of these in a browser, save the page text, and re-run with --from <file>:\n" +
      SOURCES.map((s) => `  ${s}`).join("\n"),
  );
  process.exit(1);
}

const block =
  "\t<key>SKAdNetworkItems</key>\n\t<array>\n" +
  ids
    .map((id) => `\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>${id}</string>\n\t\t</dict>`)
    .join("\n") +
  "\n\t</array>";

const plist = readFileSync(plistPath, "utf8");
const existing = extract(plist.match(/<key>SKAdNetworkItems<\/key>[\s\S]*?<\/array>/)?.[0] ?? "");

console.log(`\nInfo.plist currently lists ${existing.length}; the published list has ${ids.length}.`);
const added = ids.filter((i) => !existing.includes(i));
const gone = existing.filter((i) => !ids.includes(i));
if (added.length) console.log(`  + ${added.length} to add`);
if (gone.length) console.log(`  - ${gone.length} no longer published: ${gone.join(", ")}`);

if (!write) {
  console.log("\nDry run. Re-run with --write to apply.");
  process.exit(0);
}

const replaced = plist.replace(/\t*<key>SKAdNetworkItems<\/key>\s*<array>[\s\S]*?<\/array>/, block);
if (replaced === plist) {
  console.error("Could not find an SKAdNetworkItems block to replace in Info.plist.");
  process.exit(1);
}
writeFileSync(plistPath, replaced, "utf8");
console.log(`\nWrote ${ids.length} identifiers into ios/App/App/Info.plist`);
