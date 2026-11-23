// Build the self-test and permutation pages from the explorer.
// Usage: node prototypes/privacy-choices-tests/build.mjs
// Writes selftest.html, perm.html and perm2.html to ./out (git-ignored).
// Open each page in a browser (or headless Chromium) and read the console summary.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const join = (...parts) => path.join(...parts);
const explorer = readFileSync(
  join(here, "..", "privacy-choices-explorer.html"),
  "utf-8"
);

// Fixed frame height and synchronous animation frames, so geometry is stable.
const marker = /<script>\s*const BUSINESS/u;
if (!marker.test(explorer)) {
  throw new Error("Explorer script marker not found; update build.mjs.");
}
const base = explorer
  .replace("calc(100vh - 32px)", "740px")
  .replace(
    marker,
    (match) =>
      `<script>window.requestAnimationFrame=(f)=>{f();return 0};</script>\n${match}`
  );

const out = join(here, "out");
mkdirSync(out, { recursive: true });
for (const [page, part] of [
  ["selftest.html", "selftest.inc.html"],
  ["perm.html", "perm.inc.html"],
  ["perm2.html", "perm2.inc.html"],
]) {
  const script = readFileSync(join(here, part), "utf-8");
  // A replacer function, so `$$` in the scripts is not read as a pattern.
  writeFileSync(
    join(out, page),
    base.replace("</body>", () => `${script}</body>`)
  );
}
console.log(`Built ${out}/{selftest,perm,perm2}.html`);
