import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	computed,
	DestroyRef,
	Directive,
	inject,
	PLATFORM_ID,
} from '@angular/core';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { holdIdleDialogWarming, warmDialog } from '../core/dialog-warming';

/**
 * Turns the host, typically a footer `<button>` or `<a>`, into the control
 * that opens the consent dialog.
 *
 * It is hidden while the policy offers no way back to preferences. It also
 * starts loading the deferred dialog in idle time and on hover or focus, so
 * the first open does not wait for its code.
 *
 * @example
 * ```html
 * <button type="button" inthConsentDialogLink>Privacy settings</button>
 * ```
 */
@Directive({
	host: {
		'(click)': 'open($event)',
		'(focus)': 'warm()',
		'(pointerenter)': 'warm()',
		'[attr.data-inth-rights]': 'offered() ? rights() : null',
		'[attr.data-testid]': 'offered() ? "consent-dialog-link" : null',
		'[attr.hidden]': 'offered() ? null : ""',
	},
	selector: '[inthConsentDialogLink]',
})
export class ConsentDialogLink {
	/** @internal */
	protected readonly consent = inject(ConsentManager);

	/**
	 * Whether the policy offers a way back to preferences. While it does
	 * not, the host is hidden and carries neither the test id nor the
	 * rights, as if it were not rendered.
	 */
	protected readonly offered = computed(() =>
		this.consent.hasConsentPreferences()
	);

	/** The rights the policy grants, space-separated. */
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const theme = inject(ConsentTheme);
		const destroyRef = inject(DestroyRef);
		afterNextRender(() => {
			destroyRef.onDestroy(holdIdleDialogWarming(theme.preloadDialog()));
		});
	}

	/**
	 * Opens the dialog, unless a handler before it called `preventDefault()`.
	 *
	 * @param event - The click.
	 * @internal
	 */
	protected open(event: Event): void {
		if (event.defaultPrevented) {
			return;
		}
		event.preventDefault();
		this.consent.setActiveUI('dialog');
	}

	/** @internal */
	protected warm(): void {
		warmDialog();
	}
}
