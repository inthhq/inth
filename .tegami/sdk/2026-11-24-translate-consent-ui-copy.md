---
packages:
  "group:sdk": patch
---

### The consent prompt and dialog are translated into all 52 other bundled languages

- Every bundled language now has the `privacyChoices` section: the dialog's title and intro, "Reject all", "Accept all", "Save choices", "Always on", the vendor table, the sale and sharing row, the receipt and the announcements. They used to fall back to English, so a German visitor got a German card that turned English when it opened.
- The attribution tag's lead-in follows English's "Consent by" in every language.
- New optional keys `inlineAll`, `inlineSaleAndShare` and `inlineSaleAndTargetedAds` give the rights' name as it reads inside a sentence. Unset, the title is lower-cased as before. German and Luxembourgish set them, because they capitalise nouns.
- These strings are machine-translated and no native speaker has reviewed them. Welsh, Irish, Icelandic, Haitian Creole, Luxembourgish, Maltese, Romansh, Yiddish, Gujarati, Kannada, Tamil and Telugu are the least certain.
