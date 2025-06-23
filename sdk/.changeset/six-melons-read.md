---
"@c15t/translations": patch
"@c15t/dev-tools": patch
"@c15t/node-sdk": patch
"@c15t/backend": patch
"@c15t/nextjs": patch
"@c15t/react": patch
"c15t": patch
"@c15t/cli": patch
"docs": patch
---

refactor(nextjs): fetch inital data from backend in c15t mode instead of duplicate logic 
fix: incorrect link to quickstart
fix(issue-274): include nextjs externals in rslib
fix(core): fall back to API call if initialData promise is empty 
chore: add translation for zh