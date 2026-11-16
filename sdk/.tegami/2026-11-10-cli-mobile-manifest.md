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

Only an unreachable backend (no response, or `5xx`, `408` or `429`) takes the
debug and stale-copy paths. A reachable backend that serves a manifest the
command refuses fails every build. A skipped debug fetch deletes the earlier
copy at `--out`, so an old manifest only ships with `--allow-stale-manifest`.

The command never writes or reuses a resource the iOS and Android SDKs would
discard: an empty manifest revision, a vendor list numbered 0 or with a policy
version below 1, a vendor list with an entry of the wrong type (such as a vendor
that is a string), or a stale copy with impossible dates or an unexpected shape
now fails the build.
