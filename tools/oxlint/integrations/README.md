# Integrations lint rules

Rules for `@inth/integrations` vendor files. The Inth server sends vendor manifests as JSON, so a vendor file should describe its script as data. These rules report the code that keeps a vendor npm-only.

`oxlint.sdk.config.ts` turns them on for `packages/sdk/integrations/src/vendors/**` and `packages/sdk/integrations/src/remote.ts`, but not for test files.

| Rule | Reports |
| --- | --- |
| `no-vendor-callbacks` | `onBeforeLoad`, `onLoad`, `onConsentChange`, `onDispose`, `onError`, `validate` or `serverStart` on a script, outside an `adapters/` directory. A manifest step list such as `onConsentChange: [...]` passes. |
| `fixed-script-host` | A manifest script `src` that does not start with `https://` and a literal host, including one that comes through a spread. A `{{name}}` in the host passes only when the options this file passes to `defineRemote` declare `name` with kind `hostname`, or when `{{name}}` is the whole first label before a literal domain of two or more labels (`https://{{partnerName}}.api.useinsider.com/...`) and `name` has kind `id` with a pattern the rule can prove matches one DNS label: anchored with `^` and `$`, only letters, digits, `-`, classes of those, groups and quantifiers, and never an empty string. A spread or computed key the rule cannot follow is reported, since it could set `src`. |
| `no-url-options` | A `defineRemote` option named like a URL, source, endpoint or host, unless its kind is `hostname`. Spreads of `const` object literals in the same file are followed; options the rule cannot follow are reported. |

## Disable comments

Every disable gives its reason after `--`:

- `-- pending conversion` marks a vendor that still needs converting. The PR that converts the vendor removes the comment.
- `-- npm-only: <reason>` marks an extra the npm helper keeps on purpose, such as a function option from the site.

```ts
// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: calls the site's onReady function
script.onLoad = (info) => {
```

To list the conversions still to do, run `rg 'integrations/.*pending conversion' packages/sdk/integrations/src`.
