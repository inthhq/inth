---
packages:
  '@c15t/react': patch
---

### The IAB banner shares the banner's sheets, and the trigger's sheet loads with the trigger

The IAB banner and dialog render their rules over the banner's `tokens`,
`button` and `banner` sheets instead of the whole `first-paint` sheet, so a
page that can show either banner carries the first-paint rules once: about
8 KB gzip less in the lazy IAB chunk. The dialog trigger's and the
ConsentGate's sheets now load with their own code instead of inside the
banner's first-load chunk, about 1.7 KB gzip less before the banner renders.
