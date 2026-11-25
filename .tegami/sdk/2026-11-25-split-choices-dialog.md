---
packages:
  "group:sdk": patch
---

### The script tag loads the dialog only when it opens

- `inth.choices.js` no longer carries the "Your Privacy Choices" dialog or the opt-in confirmation. They are a new file, `inth.choices-dialog.js`, that `inth.choices.js` loads the first time the dialog opens, or in idle time while only the trigger can open it. The dialog file runs on `inth.choices.js`'s runtime, so it carries only what the banner does not use. A first visit that only answers the banner no longer downloads the dialog: `inth.choices.js` is about 3.5 KB smaller gzipped (43.0 KB to 39.5 KB), and `inth.choices-dialog.js` is 8.4 KB.
- When a link opens the dialog before the banner's file has loaded, both files are fetched side by side.
- `inth.choices-dialog.js` sits next to `inth.choices.js`. When that file has its standard name, the dialog's URL keeps its query. Set another URL with `data-choices-dialog-src` or, from the backend, `window.__inthChoicesDialogSrc`. If you host the files yourself, serve `inth.choices-dialog.js` next to `inth.choices.js`.
- A script-tag file that fails to load is tried again at a URL of its own, with `inth-retry=<n>` in its query, so an error response the browser cached does not answer the retry. This applies to `inth.hosted.js`, `inth.choices.js` and `inth.choices-dialog.js`.
- A dialog that fails to load now closes, and the banner comes back while a choice is still owed. It used to leave the visitor with neither.
