---
packages:
  '@c15t/cli': minor
---

### Bundle the consent manifest into native builds with `c15t mobile-manifest`

`c15t mobile-manifest --backend-url <url>` fetches the hosted manifest and
writes the policy resource the iOS and Android SDKs read before their first
network response. Run it as a build step. If the fetch fails, `--build release`
(the default) fails and `--build debug` warns and continues.
`--allow-stale-manifest` reuses the last fetched copy for air-gapped CI.
