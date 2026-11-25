/* oxlint-disable func-style -- The cross-domain guide shows this code as written. */
// #region docs:node-user-consent-route title="GET /api/user"
import { Inth } from '@inth/node';

// #hide docs
import { getSessionUser } from './session';
// #endhide docs

const inth = new Inth();
const noStore = { 'cache-control': 'private, no-store' };

export async function GET(request: Request) {
	const user = await getSessionUser(request);
	if (!user) {
		return Response.json(
			{ user: null, userConsent: null },
			{ headers: noStore }
		);
	}

	const [consentResult, tokenResult] = await Promise.all([
		inth.consents.check({ externalId: user.id }),
		inth.users.createIdentityToken({ externalId: user.id }),
	]);

	return Response.json(
		{
			user: {
				externalId: user.id,
				identityToken: tokenResult.error ? undefined : tokenResult.data.token,
			},
			userConsent: consentResult.error ? undefined : consentResult.data,
		},
		{ headers: noStore }
	);
}
// #endregion docs:node-user-consent-route
