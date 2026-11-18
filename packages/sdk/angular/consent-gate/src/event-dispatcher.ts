/**
 * Consent-aware analytics events for Angular components and services.
 *
 * @packageDocumentation
 */

import { assertInInjectionContext, inject } from '@angular/core';
import { ConsentManager } from '@inth/angular';
import { getEventDispatcher as getRuntimeEventDispatcher } from '@inth/sdk/events';
import type {
	EventDispatcher,
	RuntimeEventDispatcherOptions,
} from '@inth/sdk/events';

/**
 * Get the app's event dispatcher. Call it in an injection context, such as
 * a component's or service's field initializer or constructor, under
 * `provideC15t()`.
 *
 * It delivers to the provider's `scripts`, plus any you pass, and checks
 * consent when it sends, so a revoked category stops the next event. Every
 * dispatcher under the provider shares one pageview history, so a
 * component created again does not replay a navigation.
 *
 * @param options - Extra `scripts`, SPA `pageviews` integrations and
 * injectable `globals`. Pass a function, which may read signals, to
 * resolve them on each call.
 * @returns A dispatcher with `track` and `pageview`.
 * @throws {Error} Outside an injection context, or without `provideC15t()`.
 * @example
 * ```ts
 * import { Component, inject } from '@angular/core';
 * import { NavigationEnd, Router } from '@angular/router';
 * import { injectEventDispatcher } from '@inth/angular/consent-gate';
 *
 * @Component({ selector: 'app-root', template: '<router-outlet />' })
 * export class App {
 *   readonly #events = injectEventDispatcher({ pageviews: ['posthog'] });
 *
 *   constructor() {
 *     inject(Router).events.subscribe((event) => {
 *       if (event instanceof NavigationEnd) {
 *         this.#events.pageview(event.urlAfterRedirects);
 *       }
 *     });
 *   }
 * }
 * ```
 */
export const injectEventDispatcher = function injectEventDispatcher(
	options:
		| RuntimeEventDispatcherOptions
		| (() => RuntimeEventDispatcherOptions) = {}
): EventDispatcher {
	assertInInjectionContext(injectEventDispatcher);
	const { runtime } = inject(ConsentManager);
	const current = () =>
		getRuntimeEventDispatcher(
			runtime,
			typeof options === 'function' ? options() : options
		);
	return {
		pageview: (path) => current().pageview(path),
		track: (event, properties) => current().track(event, properties),
	};
};

export type { EventDispatcher, EventProperties } from '@inth/sdk/events';
export type { RuntimeEventDispatcherOptions as InjectEventDispatcherOptions };
