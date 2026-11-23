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
import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { holdIdleDialogWarming, warmDialog } from '../core/dialog-warming';
import { OptOutIcon } from '../shared/icons';

/**
 * The icon's own size, 14px tall at the glyph's ratio. A Privacy Choices
 * page never loads the classic banner sheet whose `.optOutIcon` rule sizes
 * it, so the attributes keep it from filling the line; that rule, where it
 * loads, still wins.
 */
const ICON_SIZE = (() => {
	const [, , width = 30, height = 14] = CPPA_OPT_OUT_ICON.viewBox
		.split(' ')
		.map(Number);
	const tall = 14;
	return { height: tall, width: Math.round((tall * width) / height) };
})();

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
					[attr.width]="iconSize()?.width ?? null"
					[attr.height]="iconSize()?.height ?? null"
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

	/** Unset under `noStyle`, which leaves sizing to the host. @internal */
	protected readonly iconSize = computed(() =>
		this.#theme.noStyle() ? null : ICON_SIZE
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
