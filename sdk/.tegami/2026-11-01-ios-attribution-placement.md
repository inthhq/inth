---
packages:
  '@c15t/react-native': patch
---

### Repair iOS hosted requests and consent layouts

Send the plain Swift SDK version in hosted requests, with Apple attribution in
its separate platform header, so gateways accept native initialization and saves.

Keep required and restricted category labels readable at accessibility text sizes,
and align the preferences introduction and actions with the category cards.

Choose the inline or side-column attribution in one layout pass so folding or
unfolding a supported iPhone leaves one footer logo visible.
