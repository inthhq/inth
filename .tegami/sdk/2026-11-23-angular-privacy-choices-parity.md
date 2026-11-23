---
packages:
  "group:sdk": patch
---

### Angular: the Privacy Choices banner and dialog render the same markup as React

With `presentation.design: 'privacy-choices'`, the `@inth/angular` banner and dialog now produce the same DOM as `@inth/react`, so CSS and tests you write against one adapter's markup apply to the other:

- The buttons, rows and category groups no longer carry stray attributes such as `consentaction`, `testidprefix`, `slot`, `uisource`, `mode` or `variant`. Select them by their `data-testid`, `data-action` and `data-*` state attributes as before.
- The banner's options sit directly in its scroll area (`data-testid="consent-banner-body"`), with no `<inth-pc-panel>` element in between. A selector such as `[data-testid="consent-banner-body"] > section` now matches in Angular as it does in React.
- If your page opens the dialog as soon as a choice is owed, for example from its own "Privacy settings" link logic, the banner's page announcement region (`data-testid="consent-banner-announcement"`) is still on the page, so the outcome of a choice made in the dialog is announced as it is in React.
