---
packages:
  "group:sdk": patch
---

### Share consent surface behaviour across every framework

`getSurfaceSession(kernel)` keeps the short-lived state of the banner and the "Your Privacy Choices" dialog in one place per kernel: the expanded banner options, an open confirmation and its nudge, the receipt's Details, phone sheets (at most two layers, and only while the dialog is open), one status message per layer and the copy-reference attempt. When the banner or dialog opens, closes or commits, the session clears all of it by itself, so a confirmation left open in the dialog never comes back in the banner. `session.escape()` applies one Escape order everywhere: the top sheet, then an open confirmation, then the dialog. On the banner, Escape folds expanded options and never dismisses the banner.

New rights helpers record choices through the existing consent commands:

- `pressSaleRight()` opts out in one action. Opting back in opens a confirmation first, and `confirmSaleRight()` applies it. The dialog stays open after either, and the choice answers the banner without deciding any other category, so closing the dialog does not bring the banner back. "Allow" is unavailable while a Global Privacy Control signal or the visitor's account holds the opt-out, and an expired grant shows as the default again.
- `commitBannerChoice()` handles banner Allow, Don't allow and Save. Allow never overrides a live Global Privacy Control signal or a recorded opt-out. A refusal always applies in one action. The receipt date moves only when the sale right actually changes; a Save that only changes cookies keeps it. When the signal already refuses everything the banner asks about, the banner closes at once.
- `copySurfaceReference()` reports "copied" only after the clipboard write succeeds, and ignores a result that arrives after the dialog closed.

The preference draft now reports `hasEffectiveChanges`. It counts a vendor only while its category is on, so an EU "Save choices" button can stay disabled after a change that would have no effect.

`@inth/sdk/ui/primitives/surface` adds framework-free DOM controllers that also work inside a shadow root: a focus trap for the top layer, a page block (`inert` plus scroll lock), per-layer status regions, scroll-edge fades, scroll reveal through the scroll body only, a guard against clicks right after a backdrop tap, a guard that turns off transitions while the theme switches (only for a real theme change, and safe across overlapping switches), and a timer-based end for motion when the visitor prefers reduced motion.

The stock components don't use these yet, so nothing on the page changes.
