import { isPlatformBrowser } from '@angular/common';
import {
	Directive,
	effect,
	ElementRef,
	inject,
	input,
	PLATFORM_ID,
} from '@angular/core';
import { setupFocusTrap } from '@inth/sdk/ui/utils';
import type { FocusTrapOptions } from '@inth/sdk/ui/utils';

/** `true`/`false`, or an object that also says where focus starts. */
export type FocusTrapParams =
	| boolean
	| (FocusTrapOptions & { enabled: boolean });

const resolve = function resolve(params: FocusTrapParams | '') {
	// A bare `c15tFocusTrap` attribute binds the empty string.
	if (params === '' || typeof params === 'boolean') {
		return { enabled: params !== false, options: {} };
	}
	return {
		enabled: params.enabled,
		options: { initialFocus: params.initialFocus },
	};
};

/**
 * Traps keyboard focus in the host element while enabled. Wraps
 * `setupFocusTrap` from `@inth/sdk/ui`. Does nothing on the server.
 *
 * @example
 * ```html
 * <div role="dialog" [c15tFocusTrap]="{ enabled: open(), initialFocus: 'first-tabbable' }">…</div>
 * ```
 */
@Directive({ selector: '[c15tFocusTrap]' })
export class FocusTrap {
	/** Whether the trap is on, and where focus starts. A bare attribute is on. */
	readonly c15tFocusTrap = input<FocusTrapParams | ''>(true);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
		effect((onCleanup) => {
			const { enabled, options } = resolve(this.c15tFocusTrap());
			if (enabled) {
				onCleanup(setupFocusTrap(host, options));
			}
		});
	}
}
