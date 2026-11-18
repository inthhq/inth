import { isPlatformBrowser } from '@angular/common';
import {
	computed,
	DestroyRef,
	DOCUMENT,
	effect,
	inject,
	Injectable,
	isDevMode,
	PLATFORM_ID,
	signal,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { LegalLinks } from '@inth/sdk/engine';
import type { Theme, UIOptions } from '@inth/sdk/ui/theme';
import { setupColorScheme } from '@inth/sdk/ui/utils';

import { ConsentManager } from './consent-manager';
import type { DialogPreload } from './dialog-warming';
import { warnOnUnappliedThemeTokens } from './theme-warning';

/**
 * The provider's theme and UI options, as signals, for the stock surfaces
 * and for custom ones that want to follow them.
 *
 * Provided by `provideInth()`. It also applies `colorScheme`: unset mirrors
 * a `dark` class on `<html>` as `inth-dark`; `null` leaves the class to the
 * site.
 */
@Injectable()
export class ConsentTheme {
	readonly #consent = inject(ConsentManager);
	readonly #prefersReducedMotion = signal(false);

	/** The theme, with the assigned experiment arm's theme merged over it. */
	readonly theme: Signal<Theme | undefined> = this.#consent.theme;
	/** Drop every stock class. */
	readonly noStyle: Signal<boolean> = computed(
		() => this.#consent.options().noStyle ?? false
	);
	/**
	 * Skip enter and exit motion. Follows `prefers-reduced-motion` unless
	 * the provider set `disableAnimation`.
	 */
	readonly disableAnimation: Signal<boolean> = computed(
		() =>
			this.#consent.options().disableAnimation ?? this.#prefersReducedMotion()
	);
	/** Lock page scrolling while a blocking surface is open. */
	readonly scrollLock: Signal<boolean | undefined> = computed(
		() => this.#consent.options().scrollLock
	);
	/** Trap focus in an open surface. */
	readonly trapFocus: Signal<boolean | undefined> = computed(
		() => this.#consent.options().trapFocus
	);
	/** The provider's `colorScheme` option. */
	readonly colorScheme: Signal<UIOptions['colorScheme']> = computed(
		() => this.#consent.options().colorScheme
	);
	/** Links rendered in the banner and preference-center footers. */
	readonly legalLinks: Signal<LegalLinks | undefined> = computed(
		() => this.#consent.options().legalLinks
	);
	/** When the consent dialog starts loading before its first open. */
	readonly preloadDialog: Signal<DialogPreload | undefined> = computed(
		() => this.#consent.options().preloadDialog
	);
	/** `false` when the app imports `styles.css` itself. */
	readonly styles: Signal<boolean | undefined> = computed(
		() => this.#consent.options().styles
	);
	/** CSP nonce for the `<style>` elements the surfaces add. */
	readonly nonce: Signal<string | undefined> = computed(
		() => this.#consent.options().nonce
	);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const document = inject(DOCUMENT);
		const destroyRef = inject(DestroyRef);
		const view = document.defaultView;
		if (view?.matchMedia) {
			const query = view.matchMedia('(prefers-reduced-motion: reduce)');
			this.#prefersReducedMotion.set(query.matches);
			const handler = (event: MediaQueryListEvent) => {
				this.#prefersReducedMotion.set(event.matches);
			};
			query.addEventListener('change', handler);
			destroyRef.onDestroy(() => query.removeEventListener('change', handler));
		}

		effect((onCleanup) => {
			const scheme = this.colorScheme();
			if (scheme === null) {
				return;
			}
			onCleanup(setupColorScheme(scheme));
		});

		if (isDevMode()) {
			effect(() => {
				warnOnUnappliedThemeTokens(this.theme(), document);
			});
		}
	}
}
