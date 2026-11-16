/**
 * `@c15t/angular/consent-gate`: content gated on consent, with its
 * placeholder, and the consent-aware analytics event dispatcher.
 *
 * @packageDocumentation
 */

export {
	ConsentGate,
	ConsentGateContent,
	ConsentGatePlaceholder,
} from './consent-gate';
export type { ConsentGatePlaceholderContext } from './consent-gate';
export { injectEventDispatcher } from './event-dispatcher';
