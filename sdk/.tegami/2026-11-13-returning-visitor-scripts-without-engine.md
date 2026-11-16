---
packages:
  '@c15t/core': patch
  '@c15t/react': patch
---

### Let a deferred root start a returning visitor's scripts without its engine

`@c15t/core/runtime/script-server-start` adds `storedChoiceCheckScript()`, an
inline script a server leaves for a deferred root. It runs the server start's
check of the browser's stored records and marks the page when they agree with
the state the server read.

With that mark, a deferred React root can start the plain `useScriptLoader()`
and `scripts` entries a returning visitor's choice allows without the consent
engine, and load the engine after the page's priority images. Adapters opt
in: see the Next.js and TanStack Start notes.

This also fixes a bug already in `@c15t/core`: the check that decides which
plain scripts a deferred root starts before its engine ran a script whose
`category` was an empty `and`, a `not` of an unknown category or of an empty
`or`, or a bare array. The script loader's `has()` rejects those, so the
check now rejects them too and agrees with `has()` on every condition.

It also fixes a gap already in `serverScriptStart()`: its check of the
browser's stored records accepted a compact consent cookie that the client's
decoder rejects, such as one whose decision names a missing basis. The client
then reads the legacy record instead, which may hold a newer denial. The
check now applies the decoder's structural rules and leaves the start to the
loader for any cookie that breaks them. The vendor cookie gets the same
treatment: one with an empty or missing time, a vendor id outside the slug
shape, a repeated vendor or an undecodable id no longer counts as current.

A plain script with an empty `src` no longer counts as one the page can start
without the loader. A banner choice made before the engine loaded used to
insert it, already on canary, and the element requested the page's own URL;
the loader rejects such a script.

A script with `persistAfterConsentRevoked` or `persistAfterDispose` also no
longer counts as plain. Its element can stay in the page without the mark
the early start checks, so a banner choice made before the engine loaded
could insert a second copy, which was already possible on canary.
