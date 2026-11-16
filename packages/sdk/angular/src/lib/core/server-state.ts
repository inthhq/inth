import { InjectionToken, makeStateKey } from '@angular/core';
import type { RuntimePrefetch } from '@c15t/core/runtime';

/**
 * The `TransferState` key the visitor's server-resolved consent travels
 * under, from the server render to the browser.
 *
 * `provideC15tServer()` from `@c15t/angular/ssr` sets it before the server
 * renders. {@link ConsentManager} reads it on both sides and hands it to
 * the runtime as `prefetch`, unless the app passed its own, so the browser
 * starts from the state the server rendered with and hydration matches.
 *
 * @internal
 */
export const C15T_SERVER_STATE = makeStateKey<RuntimePrefetch>('c15t');

/**
 * Opens once `provideC15tServer()` has set {@link C15T_SERVER_STATE} for
 * the request, or found it has nothing to set.
 *
 * Angular runs every app initializer before it awaits any, so another
 * initializer can build {@link ConsentManager} before the state is set.
 * On the server the manager waits here before it builds the engine; the
 * render waits for the engine, so the state is in the HTML either way.
 *
 * @internal
 */
export class ServerStateGate {
	/** Resolves once the gate opens. */
	readonly ready: Promise<void>;
	/** Opens the gate. */
	readonly open: () => void;

	constructor() {
		let open: () => void = () => undefined;
		this.ready = new Promise<void>((resolve) => {
			open = resolve;
		});
		this.open = open;
	}
}

/**
 * The request's {@link ServerStateGate}, provided by `provideC15tServer()`.
 *
 * @internal
 */
export const C15T_SERVER_STATE_GATE = new InjectionToken<ServerStateGate>(
	'C15T_SERVER_STATE_GATE'
);
