import { APP_ID, inject, Injectable } from '@angular/core';

/**
 * The id counters of one application, one per prefix. Each server render
 * and each browser app has its own root injector, so ids start again for
 * each and the server's ids match the browser's at hydration. A counter
 * per prefix keeps them matching when the browser creates a part the
 * server never rendered, such as the dialog's body warmed before the
 * prompt loads: it takes a number from its own prefix only. An app with
 * its own `APP_ID` puts it in its ids, so two apps on one page never share
 * one; `APP_ID` is the same on the server and in the browser.
 *
 * @internal
 */
@Injectable({ providedIn: 'root' })
export class UniqueIds {
	readonly #next = new Map<string, number>();
	// Angular's default, `ng`, is left out: one app per page needs no tag.
	readonly #app = inject(APP_ID);

	/**
	 * @param prefix - Names the part, such as `inth-accordion-trigger`.
	 * @returns `prefix` with this application's next number appended.
	 */
	next(prefix: string): string {
		const next = (this.#next.get(prefix) ?? 0) + 1;
		this.#next.set(prefix, next);
		return this.#app === 'ng'
			? `${prefix}-${next}`
			: `${prefix}-${this.#app}-${next}`;
	}
}

/**
 * An application-unique id for a primitive's ARIA relations. Call it in an
 * injection context, such as a field initializer.
 *
 * @param prefix - Names the part, such as `inth-accordion-trigger`.
 * @returns `prefix` with a number appended.
 * @internal
 */
export const uniqueId = function uniqueId(prefix: string): string {
	return inject(UniqueIds).next(prefix);
};
