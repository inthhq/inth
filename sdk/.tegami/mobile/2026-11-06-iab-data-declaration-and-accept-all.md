---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Show vendor data categories and grant only declared signals on Accept All

A partner's page now lists the categories of data the vendor collects. The
cores read a vendor's `dataDeclaration` from the Global Vendor List. Before,
they read a key that real lists do not use, so the section never appeared.

Accept All now matches the web. It grants purpose consent only for purposes
that some vendor declares on consent, plus purposes 1, 3 and 4 when Google ad
tech providers are listed. It grants legitimate interest only for purposes and
vendors that declare it, and special features only when a vendor declares
them. Publisher restrictions apply first. Publisher purposes stay unset, as on
the web. Before, Accept All set every purpose, special feature and vendor
legitimate interest in the list.
