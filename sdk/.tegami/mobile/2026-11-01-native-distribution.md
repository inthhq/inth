---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Prepare standalone native distributions

Install the Swift core, Apple services and optional consent UI directly from
the monorepo through its root SwiftPM manifest and semantic version tags.
Include the privacy manifest in the core resource bundle.
Expose Swift SDK version and protocol metadata through `c15t`.

Prepare signed Android core, platform and optional UI publications at matching
versions, with sources, API documentation and license metadata.
