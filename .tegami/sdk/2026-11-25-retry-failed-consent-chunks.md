---
packages:
  "group:sdk": patch
---

### A consent chunk that failed to load can load on the next try, on the same page

- Every Inth package now loads its consent chunks (the banner's containers, its options, the dialog, the confirmations and the deferred engine) through `importChunk` from `@inth/sdk/runtime/import-chunk`, which imports the chunk again on every try and never keeps a failed load. Firefox 155 and later, Chrome 156 and later, and Safari fetch a failed module again on a new `import()`, so the next tap, open or snapshot can now succeed there.
- Earlier Chromium and Firefox keep a failed module for the life of the page. There, `importChunk` loads the chunk again from its URL with `inth-retry=<n>` added, and every later try reuses that copy, so no chunk runs twice. This recovers a chunk nothing else imports by its plain URL, such as Astro's banner chunk, whose download now succeeds on the first tap. It cannot recover a chunk another chunk imports by its plain URL, such as Astro's engine chunk, or a chunk whose exports the bundler renamed.
- A chunk whose own dependency failed stays failed in every browser until the next page load. Inth still never reloads the page to recover: the banner stays, and nothing is recorded.
- See "A consent chunk fails to load" in the troubleshooting guide for what each browser and bundler can retry.
