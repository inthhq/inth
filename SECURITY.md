# Security policy

## Report a vulnerability

Do not open a public issue for a security problem, and do not discuss it in public channels until it is fixed.

Report it privately instead:

- Use GitHub's private vulnerability reporting: open [Report a vulnerability](https://github.com/inthhq/inth/security/advisories/new) on this repository.
- Or email [security@inth.com](mailto:security@inth.com). A PGP key is available on request.

Include:

- A description of the problem and its impact
- Steps to reproduce it
- The affected product and version: the Inth CLI, or an SDK package and its version
- Any proof of concept or supporting material
- How to contact you

## What happens next

- We acknowledge your report within 48 hours.
- We send an initial assessment within 5 business days.
- We keep you informed while we investigate and fix it.

Please give us the information we need to reproduce the problem, do not exploit it beyond what you need to show it, and keep it confidential until we release a fix.

## Scope

In scope:

- The Inth CLI (`@inth/cli` and its native packages)
- The consent SDK in this repository: the web packages in `packages/sdk`, React Native, Swift and Android
- How these handle credentials, consent records and personal data

Out of scope:

- Third-party dependencies that we do not maintain. Report those upstream.
- Issues that need physical access to a device or system
- Social engineering

## Recognition

With your permission, we credit reporters in the advisory for the fix.

By reporting, you agree to act in good faith and to follow responsible disclosure.
