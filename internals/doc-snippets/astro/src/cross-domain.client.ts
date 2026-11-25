/* oxlint-disable func-names, unicorn/no-anonymous-default-export -- The cross-domain guide shows this code as written. */
// #region docs:cross-domain-client title="src/inth.client.ts"
import type { InthClientOptionsExtension } from '@inth/astro';

export default async function (): Promise<InthClientOptionsExtension> {
	const res = await fetch('/api/user');
	const { user, userConsent } = await res.json();
	return { user, userConsent };
}
// #endregion docs:cross-domain-client
