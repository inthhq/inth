import { computed, inject, Injectable } from '@angular/core';
import type { Signal } from '@angular/core';
import type {
	ActiveUI,
	OptOutResult,
	ResolvedConsentPresentation,
	SaveUISource,
} from '@inth/sdk/engine';
import { resolveConsentPresentation } from '@inth/sdk/surface-state';

import { ConsentManager } from './consent-manager';

/** A surface's resolved presentation, and whether it is open. */
export interface HeadlessConsentSurfaceState extends ResolvedConsentPresentation {
	isVisible: boolean;
}

/** An action a headless surface performs. */
export type HeadlessConsentAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

/**
 * The state and actions a custom banner or dialog needs, with the policy's
 * presentation already resolved.
 *
 * Provided by `provideInth()`. Build your own consent UI on it when the
 * stock surfaces don't fit; the policy still decides which actions show.
 *
 * @example
 * ```ts
 * @Component({
 *   selector: 'app-banner',
 *   changeDetection: ChangeDetectionStrategy.OnPush,
 *   template: `
 *     @if (headless.banner().isVisible) {
 *       @for (action of headless.banner().actions; track action) {
 *         <button type="button" (click)="headless.performAction(action)">{{ action }}</button>
 *       }
 *     }
 *   `,
 * })
 * export class AppBanner {
 *   protected readonly headless = inject(HeadlessConsent);
 * }
 * ```
 */
@Injectable()
export class HeadlessConsent {
	readonly #consent = inject(ConsentManager);

	/** Which consent surface is open. */
	readonly activeUI: Signal<ActiveUI> = this.#consent.activeUI;

	/** The first-layer prompt's presentation, and whether it is open. */
	readonly banner: Signal<HeadlessConsentSurfaceState> = computed(() =>
		this.#resolve('banner')
	);

	/** The preference center's presentation, and whether it is open. */
	readonly dialog: Signal<HeadlessConsentSurfaceState> = computed(() =>
		this.#resolve('dialog')
	);

	openBanner(): void {
		this.#consent.setActiveUI('banner');
	}

	/** Open the preference dialog. */
	openDialog(): void {
		this.#consent.setActiveUI('dialog');
	}

	/** Close whichever surface is open. */
	closeUI(): void {
		this.#consent.setActiveUI('none');
	}

	/**
	 * Record an opt-out in one click and open the confirmation view under an
	 * opt-out policy. Under other policy models, open the preference dialog.
	 */
	optOut(context?: { uiSource?: SaveUISource }): Promise<OptOutResult> {
		return this.#consent.requestOptOut(context);
	}

	/**
	 * Perform one consent action: `accept` and `reject` record a bulk choice,
	 * `save` records the draft, `dismiss` dismisses a notice, and `customize`
	 * opens the dialog.
	 *
	 * @throws {Error} When the save fails.
	 */
	async performAction(action: HeadlessConsentAction): Promise<void> {
		switch (action) {
			case 'dismiss':
				await this.#consent.dismissNotice();
				return;
			case 'save':
				await this.#consent.saveConsents('custom');
				return;
			case 'accept':
				await this.#consent.saveConsents('all');
				return;
			case 'reject':
				await this.#consent.saveConsents('necessary');
				return;
			default:
				this.#consent.setActiveUI('dialog');
		}
	}

	/**
	 * Record the draft. Same as `performAction('save')`.
	 *
	 * @throws {Error} When the save fails or the draft is stale.
	 */
	async saveCustomPreferences(): Promise<void> {
		await this.#consent.saveConsents('custom');
	}

	#resolve(surface: 'banner' | 'dialog'): HeadlessConsentSurfaceState {
		return {
			...resolveConsentPresentation({
				policy: this.#consent.policyRule(),
				presentation: this.#consent.presentation(),
				surface: surface === 'banner' ? 'prompt' : 'preferences',
			}),
			isVisible: this.#consent.activeUI() === surface,
		};
	}
}
