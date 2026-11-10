---
packages:
  '@c15t/react-native': minor
---

### Connect Braze, Branch and Singular to native consent

`@c15t/react-native/integrations` adds `connectBraze`, `connectBranch` and
`connectSingular`:

- Braze stays disabled until its category is granted, and records Google's
  DMA consent attributes on the user while it runs. Withdrawing the category
  disables Braze at once, so Braze keeps the last attributes it received; the
  Braze guide explains how to clear them.
- Branch sets its attribution level from marketing and measurement, and sends
  DMA parameters. Deep links keep working at every level.
- Singular stops all tracking until its category is granted, then resumes,
  opts in and limits data sharing from marketing.
