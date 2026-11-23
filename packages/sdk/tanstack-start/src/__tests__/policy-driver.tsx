import { createFrameworkPolicyDriver } from '../../../react/src/__tests__/framework-policy-driver';
import { InthProvider } from '../inth-provider';
import { resolveConsent } from '../server';

export const { createPolicySession, probePolicyContract } =
	createFrameworkPolicyDriver({
		Root: InthProvider,
		readInitialConfig: ({ cookie, cookieName, now }) => {
			const request = new Request('https://example.com');
			// Browser Requests strip Cookie; server Requests retain it.
			Object.defineProperty(request, 'headers', {
				value: new Headers({ cookie }),
			});
			return resolveConsent({ cookieName, now, request });
		},
	});
