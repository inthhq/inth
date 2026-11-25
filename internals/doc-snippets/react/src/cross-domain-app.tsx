/* oxlint-disable func-style, react/function-component-definition, react/memo-dependencies, react-hooks/exhaustive-deps, promise/no-nesting, promise/prefer-await-to-then -- The cross-domain guide shows this code as written. */
// #region docs:cross-domain-app title="App.tsx"
import { InthProvider } from '@inth/react';
import { useMemo } from 'react';

// @ts-expect-error The guide leaves the props untyped // docs:hide
export function App({ user, children }) {
	const userConsent = useMemo(
		() =>
			user
				? fetch('/api/user').then((res) =>
						res.ok ? res.json().then((data) => data.userConsent) : undefined
					)
				: null,
		[user?.externalId]
	);

	return (
		<InthProvider
			options={{
				projectUrl: import.meta.env.VITE_INTH_PROJECT_URL,
				user: user
					? { externalId: user.externalId, identityToken: user.identityToken }
					: undefined,
				userConsent,
			}}
		>
			{children}
		</InthProvider>
	);
}
// #endregion docs:cross-domain-app
