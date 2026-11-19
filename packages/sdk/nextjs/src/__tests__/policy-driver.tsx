import { createFrameworkPolicyDriver } from '../../../react/src/__tests__/framework-policy-driver';
import { InthProvider } from '../root';
import { resolveConsent } from '../server';

export const { createPolicySession, probePolicyContract } =
	createFrameworkPolicyDriver({
		Root: InthProvider,
		readInitialConfig: ({ cookie, cookieName, now }) =>
			resolveConsent({
				cookieName,
				now,
				request: {
					cookies: () => ({ toString: () => cookie }),
					headers: () => new Headers({ cookie }),
				},
			}),
	});
