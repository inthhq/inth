# @inth/node

The Inth client for a customer's server.

```sh
npm install @inth/node@alpha
```

It links browsers to your own users, reads what they consent to, publishes your legal
documents and records who accepted them, with the project's secret key. The
key can act for any user in the project, so keep it on the server.

It uses only `fetch`, `AbortSignal` and Web Crypto, so it runs on Node 20.3
or later, Vercel Functions and Cloudflare Workers. Workers need no
`nodejs_compat` flag.

Calls about a user take `externalId`, your own id for them.

```ts
import { Inth } from '@inth/node';

// Reads INTH_SECRET_KEY and INTH_PROJECT_URL when you pass nothing
const inth = new Inth();

// When a user signs in: link the browser to your user
const { data: link, error: linkError } = await inth.users.identify({
	externalId: user.id,
	subjectId,
});
if (linkError) {
	// Sign-in can go on. Log it: this browser's choices do not count as the
	// user's until a later sign-in links it
	console.error(linkError);
}

// Has this user accepted the latest privacy policy that requires acceptance?
const { data, error } = await inth.documents.check({
	externalId: user.id,
	types: ['privacy_policy'],
});
if (error) {
	// The check failed, which says nothing about the user. Log it, and do
	// not ask them to accept again because of it
	throw error;
}
if (!data.privacy_policy.acceptedLatest) {
	// Ask them to accept it
}

// Does this user allow marketing, on any of their devices? A failed check
// leaves `consent` null, which reads as no
const { data: consent } = await inth.consents.check({ externalId: user.id });
if (consent?.marketing === true) {
	// Send the newsletter
}
```

On Cloudflare Workers without the `nodejs_compat` flag there is no
`process.env`, so pass both from the Worker's environment:

```ts
import { Inth } from '@inth/node';

interface Env {
	INTH_PROJECT_URL: string;
	// Set with `wrangler secret put INTH_SECRET_KEY`
	INTH_SECRET_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const inth = new Inth({
			projectUrl: env.INTH_PROJECT_URL,
			secretKey: env.INTH_SECRET_KEY,
		});
		const externalId = new URL(request.url).searchParams.get('user') ?? '';
		const { data, error } = await inth.consents.check({ externalId });
		if (error) {
			return Response.json({ error: error.message }, { status: 502 });
		}
		return Response.json(data);
	},
};
```

## Where the subject ID comes from

The subject ID is made in the browser, when a visitor first saves a choice.
The banner stores it in the consent cookies, and the SDK's server entry
reads it back from a request:

```ts
import { readRequestConsent } from '@inth/sdk/server';

const { state } = readRequestConsent({
	adapter: '@inth/nextjs',
	request: { headers: request.headers },
});
const subjectId = state.initialRecords?.subject?.subjectId;
```

On a c15t banner, import `readRequestConsent` from `c15t/server` instead.
Read it with the SDK, not by parsing the cookie yourself: the cookie format
changes between versions.

A c15t banner's id starts with `sub_`. `identify` accepts it and answers with
the subject's UUID in `link.subjectId`. The backend accepts either id for that
browser afterwards.

Whether a visitor has a subject ID before they choose depends on the c15t
version. c15t 3.2 gives every visitor one on their first response, in a
`<storageKey>-sid` cookie, so link it at sign-in. Later versions make the ID
with the first save. There, a visitor who has not chosen anything has nothing
to link yet, and their first save can carry your user ID instead, through the
`user` option of the c15t client.

## Servers that never see the cookie

An API on another domain or a mobile backend cannot read the subject ID, so
it cannot call `identify`. Instead it asks for an identity token and sends it
to the browser, and the browser links itself:

```ts
// On your server, after the user signs in
const { data, error } = await inth.users.createIdentityToken({
	externalId: user.id,
});
if (error) throw error;
// Send data.token to the browser
```

```ts
// In the browser
await client.identify({ externalId: user.id, identityToken: token });
```

The token proves the browser belongs to that user, and expires after an
hour. Make one per sign-in or page load; do not store it. When you pass
`identityProvider`, the browser must pass the same one to `identify`.
When identity tokens are not enabled for the project, the call returns
`not_found` with `apiCode` `identity_tokens_disabled`.

## What a user consents to

`consents.check` answers what a user consents to now, from the banner
answers of every device you linked to them with `identify`:

```ts
const { data, error } = await inth.consents.check({ externalId: user.id });
// { marketing: false, measurement: true }
```

Per category, the answer they confirmed last stands. A user who allowed
marketing on their laptop and later refused it on their phone has refused
it. A device nobody linked to them does not count.

A category is absent when the user never answered it, or when their grant
has run out. Apply your policy's default to it: under an opt-in policy,
treat absent as refused.

Pass `property` to count only the answers given on one site or app, by its
host name or its application or bundle ID. Leave it out to count every
property, which treats a choice made on one as made on all:

```ts
await inth.consents.check({
	externalId: user.id,
	property: 'com.example.app',
});
```

## Legal documents

Publish a version when you deploy a new document. The hash is of the exact
bytes you serve, so hash the file itself:

```ts
import { readFile } from 'node:fs/promises';
import { hashDocument } from '@inth/node';

const { error } = await inth.documents.publish({
	type: 'terms_us',
	version: '2026-11-18',
	hash: await hashDocument(await readFile('public/terms-us.html')),
	effectiveDate: new Date('2026-11-18T00:00:00Z'),
});
```

`effectiveDate` takes a `Date` or an ISO 8601 string. The published version
comes back in `data`, the same shape `documents.current` answers with.

A type starts with a lowercase letter, followed by lowercase letters, digits
and `_`, such as `privacy_policy`. Make
one type per region: `terms_us`, `terms_eu`. Pass `requiresAcceptance: false`
for a small edit: people who accepted the previous version are not asked
again.

### Recording acceptance at sign-up

When you show the sign-up form, fetch the documents in force. Each has a
`hash` that names the version the visitor saw. Link to that version, not to
an address whose content can change while the form is open, and put the
hashes in the form:

```ts
const [terms, privacy] = await Promise.all([
	inth.documents.current({ type: 'terms_us' }),
	inth.documents.current({ type: 'privacy_policy' }),
]);
if (terms.error || privacy.error) {
	// Do not show the form without the documents
	throw terms.error ?? privacy.error;
}
// Link to /terms/${terms.data.version} and the same for privacy,
// and send terms.data.hash and privacy.data.hash with the form
```

When the form comes back, create the user first. Then record the acceptance
for them, with your user ID as `externalId`, the hashes from the form, and the
visitor's IP address and user agent from the request:

```ts
const user = await createUser(form);

// The whole call, made once. A resend sends it unchanged, so the
// acceptance is recorded once
const acceptance = {
	idempotencyKey: crypto.randomUUID(),
	acceptedAt: Date.now(),
	externalId: user.id,
	acceptances: [
		{ type: 'terms_us', hash: form.termsHash },
		{ type: 'privacy_policy', hash: form.privacyHash },
	],
	context: {
		ipAddress: clientIp(request),
		userAgent: request.headers.get('user-agent') ?? undefined,
	},
};

const { error } = await inth.documents.accept(acceptance);
if (error) {
	if (error.retryable) {
		// It may or may not be recorded. Save `acceptance` and resend it
		// later, from a job, until it succeeds
	} else {
		// Refused: resending will not help. Ask the user to accept when they
		// next sign in, where documents.check says they have not
	}
}
```

`clientIp` stands for however your platform gives the visitor's address, such
as `request.ip`, or a header your host sets and a visitor cannot. Do not take
the first entry of `x-forwarded-for`: the visitor writes it. Behind a proxy
you trust, take the entry that proxy appended, counting from the right. The
call comes from your server, so Inth cannot see the visitor's address or user
agent unless you send them.

All the acceptances in one call are recorded, or none are. A version that is
no longer in force is still recorded as the one accepted, and
`documents.check` then reports the newer one as not accepted. A hash the
project never published is refused with `conflict` and `apiCode`
`document_unknown`.

The client makes an idempotency key for each call and sends it on each of its
own retries, so a retried call is recorded once. To resend a call yourself,
make a key once with `crypto.randomUUID()` and pass it as `idempotencyKey`,
with the same `acceptedAt`, each time. `acceptedAt` takes a `Date` or
milliseconds since the epoch. The key must be a UUID. A refused call
records nothing under its key, so you can resend it once the cause is fixed.

`documents.check` then says whether the user accepted the latest version that
requires acceptance:

```ts
const { data, error } = await inth.documents.check({
	externalId: user.id,
	types: ['terms_us'],
});
if (error) {
	throw error;
}
if (!data.terms_us.acceptedLatest) {
	// Ask them to accept the new terms
}
```

## Results, not exceptions

No method throws for a request that fails. Each resolves to `{ data, error }`
with exactly one of the two set. Check `error` first and TypeScript knows
`data` is there.

`error.code` is one of a fixed set, so you can branch on it:
`unauthorized`, `forbidden`, `rate_limited`, `invalid_request`, `not_found`,
`conflict`, `network_error`, `timeout`, `aborted`, `server_error`,
`unexpected_response`. The error also carries:

- `retryable`: whether sending the same call again later may succeed. It is
  true for a network failure, a timeout, a 429 or a 5xx, and always false
  for `documents.publish`, whose failure may have been stored. The client
  tries these again itself within `maxRetries`, unless the API asked for a
  longer wait than it makes or the edge challenged the call.
- `retryAfter`: how long the API asked you to wait, in milliseconds, when it
  sent `Retry-After`.
- `status`: the HTTP status, or 0 when no answer arrived.
- `apiCode`: the API's own code, such as `identity_conflict` or
  `document_unknown`. Your editor lists the codes the `/v1` routes send.
- `details`: for a refused body, the messages for each field in
  `fieldErrors`, such as `effectiveDate`, and the rest in `formErrors`. A
  field the client refuses itself, such as an invalid `Date`, is named here
  too.
- `requestId`: the id to quote to support.
- `cause`: what `fetch` threw, when no answer arrived.

Two things throw. `new Inth()` throws an `InthError` with the code
`invalid_request` and `status` 0 when it has no key, a key a header
cannot carry, or an address that is not a full `https://` URL (plain
`http://` is allowed for `localhost` and `*.localhost` only) or one with a
query, fragment, user name or password, or when `timeout` is not a whole number
of milliseconds or `maxRetries` is not a whole number. `hashDocument` throws a `TypeError`
when given anything but bytes.

When the edge network in front of the API challenges a call, as it does an
address that sends too many requests too fast, the call returns
`rate_limited` with `status` 403. A server cannot pass the challenge, and
it lasts minutes, so the client does not retry it: slow down and try again
later.

## Types

`documents.check` answers with one entry for each type you asked about, and
nothing else. Asking for `['privacy_policy']` and reading `data.dpa` is a
compile error.

## Your project's document types

`types` accepts the common document types and any other string. To have
the compiler check them against your project, declare them once:

```ts
// The import makes this file extend @inth/node rather than replace it
import '@inth/node';

declare module '@inth/node' {
	interface Register {
		documentTypes: 'privacy_policy' | 'terms_and_conditions';
	}
}
```

## Retries and timeouts

A request that could not be answered is tried again, up to twice by default:
a network failure, a timeout, a 408, a 429 or a 5xx. It waits between tries, and
follows `Retry-After` when the API sends one. A refused request, such as a
wrong key, is not tried again.

`documents.publish` is never tried again. The version may have been stored
before the failure, and a late second try could make it current again after
a newer one. Check with `documents.current` before you publish again.

A redirect is not followed, so the key is never sent to another address. The
call returns `unexpected_response`; check the project URL in the Dashboard.

When the API asks for a wait longer than five seconds, the call returns
`rate_limited` at once instead of trying again too early, with the wait in
`error.retryAfter`.

Each try may take 10 seconds by default. Set both for the client or for one
call, and cancel a call with a signal:

```ts
const inth = new Inth({ maxRetries: 3, timeout: 5000 });

await inth.documents.check(
	{ externalId, types: ['privacy_policy'] },
	{ timeout: 1000, signal }
);
```

## Where it points

`projectUrl` is the project's URL, the same address the banner uses, such as
`https://your-project.inth.app`. The key is the project's secret key
(`inth_prj_...`), or an organization API key (`inth_...`) that reaches the
project and holds the permissions the calls need: `consent.subjects.read`
and `consent.subjects.write` for linking users, `documents.read` and
`documents.write` for documents. Both are created and rotated in the
Dashboard. Every call uses the project's `/v1` routes.

The tests are in `src/index.test.ts`, against a stubbed `fetch`. The types
come from the API's OpenAPI document in
`packages/sdk/schema/vendor/backend-openapi/`, which the web SDK checks its
schemas against too.
