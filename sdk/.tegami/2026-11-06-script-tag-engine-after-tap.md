---
packages:
  '@c15t/browser': patch
---

### The script tag loads the engine after an early Accept or Reject is stored

A press on an Accept or Reject that `c15t.js` records itself no longer starts
downloading `c15t.hosted.js` at the same moment as the gated scripts the tap
starts and `c15t.commit.js`. The engine loads once the choice is stored, so
those files have the connection first. A press on Customize waits for the
dialog in the same way (see the two-stage script tag note). A press anywhere
else on the page still loads the engine at once.
