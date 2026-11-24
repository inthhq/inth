/* oxlint-disable no-nested-ternary, react/function-component-definition -- The cross-domain guide shows this code as written. */
// #region docs:cross-domain-layout title="app/layout.tsx"
import { InthProvider } from '@inth/nextjs';
import { resolveConsent } from '@inth/nextjs/server';
import { Inth } from '@inth/node';

// #hide docs
import { getSessionUser } from '../lib/session';
// #endhide docs

const inth = new Inth();

// @ts-expect-error The guide leaves the props untyped // docs:hide
export default async function RootLayout({ children }) {
	const sessionUser = await getSessionUser();
	const [consentResult, tokenResult] = sessionUser
		? await Promise.all([
				inth.consents.check({ externalId: sessionUser.id }),
				inth.users.createIdentityToken({ externalId: sessionUser.id }),
			])
		: [null, null];
	const userConsent =
		sessionUser === null
			? null
			: consentResult?.error
				? undefined
				: consentResult?.data;

	const state = await resolveConsent({
		user: sessionUser ? { externalId: sessionUser.id } : undefined,
		userConsent,
	});

	return (
		<html lang="en">
			<body>
				<InthProvider
					state={state}
					options={{
						user: sessionUser
							? {
									externalId: sessionUser.id,
									identityToken: tokenResult?.error
										? undefined
										: tokenResult?.data.token,
								}
							: undefined,
						userConsent,
					}}
				>
					{children}
				</InthProvider>
			</body>
		</html>
	);
}
// #endregion docs:cross-domain-layout
