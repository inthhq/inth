import type {
	AstroConsentClient,
	AstroEngineClient,
} from '../astro-consent-client.model';

/** What the first-load shell's client adds to the listener. @internal */
export interface DeferredClientHooks {
	/** Called on dialog intent: starts the engine with the dialog. */
	warm: () => void;
	/** Loads the engine and resolves with its client. */
	engine: () => Promise<AstroEngineClient>;
}

const deferredHooks = new WeakMap<AstroConsentClient, DeferredClientHooks>();

/**
 * Register what the listener does for the first-load shell's client, which
 * has no runtime until its engine loads.
 *
 * @internal
 */
export const registerDeferredClient = function registerDeferredClient(
	client: AstroConsentClient,
	hooks: DeferredClientHooks
): void {
	deferredHooks.set(client, hooks);
};

/**
 * What the first-load shell registered for `client`, or `undefined` for
 * the engine's own client.
 *
 * @internal
 */
export const readDeferredClientHooks = function readDeferredClientHooks(
	client: AstroConsentClient
): DeferredClientHooks | undefined {
	return deferredHooks.get(client);
};
