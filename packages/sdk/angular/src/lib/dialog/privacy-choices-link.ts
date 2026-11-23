import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	PLATFORM_ID,
} from '@angular/core';
import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
import {
	resolveConsentDesign,
	resolvePrivacyChoicesLink,
} from '@inth/sdk/surface-state';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { holdIdleDialogWarming, warmDialog } from '../core/dialog-warming';
import { OptOutIcon } from '../shared/icons';

/**
 * The "Your Privacy Choices" footer link: an unstyled button that opens
 * the preference dialog. It never records an opt-out on its own.
 *
 * Under an opt-out policy with the opt-out right it reads the title
 * resolved from `presentation.optOutLink` (or `variant`), with the
 * California Privacy Protection Agency opt-out icon beside both Privacy
 * Choices titles. Under `design: 'privacy-choices'` it is also the way back
 * into the dialog under an opt-in policy, in the US or the EU: it reads
 * "Your Privacy Choices" there, with no opt-out icon, since no opt-out
 * right is offered. The dialog returns focus to it when its opener is gone.
 *
 * Renders nothing when the active policy gives no opt-out right (on the
 * classic design), when no policy has resolved yet, or when an external
 * consent source owns consent. Content between the tags replaces the
 * label.
 *
 * @example
 * ```html
 * <inth-privacy-choices-link />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [OptOutIcon],
	selector: 'inth-privacy-choices-link',
	template: `@if (link(); as link) {
		<button
			type="button"
			[attr.class]="rootClass() ?? null"
			data-testid="privacy-choices-link"
			[attr.data-inth-rights]="rights()"
			[attr.data-opt-out-variant]="
				link.variant === 'choices' ? null : link.variant
			"
			(click)="open($event)"
			(focus)="warm()"
			(pointerenter)="warm()"
		>
			@if (link.icon) {
				<svg
					inth-opt-out-icon
					[attr.class]="iconClass()"
				></svg>
			}
			<ng-content>{{ link.label }}</ng-content>
		</button>
	}`,
})
export class PrivacyChoicesLink {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/**
	 * Override `presentation.optOutLink` for this link: `'privacy-choices'`,
	 * `'california-privacy-choices'` or `'do-not-sell'`.
	 */
	readonly variant = input<OptOutLinkVariant | undefined>(undefined);
	/** A class for the button. */
	readonly rootClass = input<string | undefined>(undefined);

	/** @internal */
	protected readonly link = computed(() => {
		const presentation = this.#consent.presentation();
		return resolvePrivacyChoicesLink(
			this.#consent.snapshot(),
			this.#consent.copy(),
			{
				design: resolveConsentDesign(presentation),
				variant: this.variant() ?? presentation?.optOutLink,
			}
		);
	});

	/** @internal */
	protected readonly rights = computed(() =>
		this.#consent.snapshot().policyRule.rights.join(' ')
	);

	/** @internal */
	protected readonly iconClass = computed(() =>
		this.#theme.noStyle() ? null : (bannerStyles.optOutIcon ?? null)
	);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const destroyRef = inject(DestroyRef);
		afterNextRender(() => {
			destroyRef.onDestroy(holdIdleDialogWarming(this.#theme.preloadDialog()));
		});
	}

	/**
	 * Opens the dialog, unless a handler before it called `preventDefault()`.
	 *
	 * @internal
	 */
	protected open(event: Event): void {
		if (event.defaultPrevented) {
			return;
		}
		this.#consent.setActiveUI('dialog');
	}

	/** @internal */
	protected warm(): void {
		warmDialog();
	}
}
