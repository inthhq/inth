---
packages:
  "group:sdk": patch
---

### Script tag: the consent banner matches React

- The `consentBannerRightLink` theme slot now styles the notice's "Do not sell or share my data" link, in every container and in the slim bar. Before, the type listed it but the banner ignored it. The link also carries `part="consentBannerRightLink"`.
- The banner root carries `data-model` (the policy's model, such as `opt-in` or `opt-out`) and `data-prompt` (the policy's prompt, such as `choice` or `notice`), as React's does. The notice's opt-out link carries `data-action="customize"`.
- `ui.banner.scrollLock` and `ui.banner.trapFocus` apply to the IAB banner only. The stock banner blocks the page only with `presentation.prompt.blockUntilChoice`, or when the policy requires it. The option docs now say so.
