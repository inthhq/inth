---
packages:
  '@c15t/react-native': patch
---

### Show vendor data categories and grant only declared signals on Accept All

The native IAB partner page now lists the categories of data each vendor
collects, read from the vendor's `dataDeclaration` in the Global Vendor List.

Accept All now grants only what the vendors declare, as on the web: purposes
and special features that some vendor declares, legitimate interest only for
purposes and vendors that claim it, and purposes 1, 3 and 4 when Google ad tech
providers are listed. Publisher restrictions apply first, and publisher
purposes stay unset.
