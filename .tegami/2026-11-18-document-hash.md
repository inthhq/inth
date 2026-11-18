---
packages:
  "group:inth": patch
---

### Hash legal documents with `inth document hash`

`inth document hash privacy-policy.md` prints the hash that identifies a published version of a privacy policy or terms of service: `sha256:` and the lowercase hex SHA-256 of the file's exact bytes. Line endings, whitespace and encoding are not normalized, so a CRLF copy hashes differently from an LF copy. Pass `-` to hash stdin, and `--json` to read `path`, `bytes` and `hash` from a script. It needs no sign-in, makes no network request and never prompts.
