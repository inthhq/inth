---
packages:
  '@c15t/react-native': patch
---

### Refuse a vendor list with a malformed entry on iOS

On iOS, the SDK now refuses a Global Vendor List whole when any entry has the
wrong type, as it already did on Android. It used to drop or blank the entry and
keep the rest, which no longer matched the list version recorded in the TC
String. A refused live list reads as no list, and the SDK keeps a list it
already holds while that list is within its age limit.
