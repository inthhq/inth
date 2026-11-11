---
packages:
  'swift:c15t-swift': patch
---

### Refuse a vendor list with a malformed entry on iOS

The Swift core now refuses a Global Vendor List whole when any entry has the
wrong type, such as a vendor that is a string, or when a collection arrives as
an array instead of an object. It used to drop or blank the entry and keep the
rest. The TC String records the list's version, which says the person saw that
list, and a list with entries missing is not it. Android already refused these
lists. A refused live list reads as no list: the core keeps a list it already
holds while that list is within its age limit.
