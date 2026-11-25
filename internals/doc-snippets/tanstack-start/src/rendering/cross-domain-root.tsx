/* oxlint-disable no-nested-ternary -- The cross-domain guide shows this code as written. */
// #region docs:cross-domain-root title="src/routes/__root.tsx"
import { Inth } from '@inth/node';
import { resolveConsent } from '@inth/tanstack-start/server';

// #hide docs
import { getSessionUser } from './session';
// #endhide docs

const inth = new Inth();

// Inside your server loader:
const sessionUser = await getSessionUser();
const consentResult = sessionUser
	? await inth.consents.check({ externalId: sessionUser.id })
	: null;
const userConsent =
	sessionUser === null
		? null
		: consentResult?.error
			? undefined
			: consentResult?.data;

const consentState = await resolveConsent({
	user: sessionUser ? { externalId: sessionUser.id } : undefined,
	userConsent,
});
// #endregion docs:cross-domain-root

export { consentState };
