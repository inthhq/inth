/**
 * The context every hook reads.
 *
 * The context value is the client, never a snapshot. Putting state in context
 * would mean a new context value on every consent change and a rerender of
 * every consumer, which is the thing the subscription registry exists to
 * avoid.
 */

import { createContext, useContext } from 'react';

import type { ConsentClient } from '../native/client';

/**
 * Context holding the app's {@link ConsentClient}, or `null` outside a
 * provider.
 */
export const ConsentClientContext = createContext<ConsentClient | null>(null);

/**
 * Read the client from context.
 *
 * @returns The client the nearest {@link InthProvider} installed.
 * @throws {Error} When no provider is mounted, because a hook that quietly
 *   returned a deny-all snapshot would look like a consent bug rather than a
 *   wiring mistake.
 */
export const useConsentClient = function useConsentClient(): ConsentClient {
	const client = useContext(ConsentClientContext);

	if (client === null) {
		throw new Error(
			'@inth/react-native hooks need an <InthProvider> above them in the tree. Render <InthProvider> once, near the root of your app, and mount the consent UI inside it.'
		);
	}

	return client;
};
