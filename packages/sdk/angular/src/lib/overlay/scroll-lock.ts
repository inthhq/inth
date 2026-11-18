import { isPlatformBrowser } from '@angular/common';
import { Directive, effect, inject, input, PLATFORM_ID } from '@angular/core';
import { setupScrollLock } from '@inth/sdk/ui/utils';

/**
 * Locks document scrolling while enabled and the host is rendered. Wraps
 * `setupScrollLock` from `@inth/sdk/ui`. Does nothing on the server.
 *
 * @example
 * ```html
 * <div class="overlay" [inthScrollLock]="open()"></div>
 * ```
 */
@Directive({ selector: '[inthScrollLock]' })
export class ScrollLock {
	/** Whether scrolling is locked. A bare attribute locks it. */
	readonly inthScrollLock = input<boolean | ''>(true);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		effect((onCleanup) => {
			if (this.inthScrollLock() !== false) {
				onCleanup(setupScrollLock());
			}
		});
	}
}
