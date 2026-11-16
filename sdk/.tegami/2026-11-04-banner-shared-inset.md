---
packages:
  "@c15t/ui": patch
---

### Line up the banner's text and buttons, and give the dialog more room on phones

In the floating card and the choice wall, the banner's text sat 16px from the
edge on phones and 24px on wider screens, but its buttons sat 20px in at every
width. The text and the buttons now start on the same edge: 16px on phones and
24px from 640px up. Two new variables set the inset:
`--consent-banner-padding-mobile` below 640px and `--consent-banner-padding`
from 640px up.

On phones, the preferences dialog kept its 24px desktop padding inside the
card, on top of the 16px gap to the screen edge. Below 640px the card now
uses `--consent-dialog-card-padding-mobile`, 16px, so its content gains 16px
of width and lines up with the "Secured by" tag. Wider screens are unchanged.
