import { APP_ID, inject, Injectable } from '@angular/core';

/**
 * The id counter of one application. Each server render and each browser
 * app has its own root injector, so ids start again for each and the
 * server's ids match the browser's at hydration. An app with its own
 * `APP_ID` puts it in its ids, so two apps on one page never share one;
 * `APP_ID` is the same on the server and in the browser.
 *
 * @internal
 */
@Injectable({ providedIn: 'root' })
export class UniqueIds {
	#next = 0;
	// Angular's default, `ng`, is left out: one app per page needs no tag.
	readonly #app = inject(APP_ID);

	/**
	 * @param prefix - Names the part, such as `c15t-accordion-trigger`.
	 * @returns `prefix` with this application's next number appended.
	 */
	next(prefix: string): string {
		this.#next += 1;
		return this.#app === 'ng'
			? `${prefix}-${this.#next}`
			: `${prefix}-${this.#app}-${this.#next}`;
	}
}

/**
 * An application-unique id for a primitive's ARIA relations. Call it in an
 * injection context, such as a field initializer.
 *
 * @param prefix - Names the part, such as `c15t-accordion-trigger`.
 * @returns `prefix` with a number appended.
 * @internal
 */
export const uniqueId = function uniqueId(prefix: string): string {
	return inject(UniqueIds).next(prefix);
};
