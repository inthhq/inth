---
packages:
  '@c15t/iab': patch
---

### Keep publisher restrictions off vendors you did not restrict

The TC string no longer joins two restricted vendors into one range across
vendor IDs the vendor list leaves out. A list scoped to your vendors, through
the `vendors` option, an inline `gvl` or the backend's `gvl.vendorIds`, leaves
out most registered vendors. Restricting vendors 21 and 52 used to write the
range 21 to 52, which also restricted every registered vendor between them.
Those vendors had no consent or legitimate interest, so no vendor could do
anything new, but the string listed restrictions you never set.

Returning visitors no longer see the banner again when you add a vendor whose
ID sits between two restricted vendors. A string saved by an earlier version
still asks once in that case, then saves the corrected string.
