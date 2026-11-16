---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Read custom IAB vendors from the bundled manifest

A launch served only by the bundled manifest now lists the custom vendors it
carries under `disclosures.customVendors`, and Accept all grants them, as it
does after a live `/init`. Export the resource with a CLI that includes them.
A resource without the key keeps the list the device already holds.
