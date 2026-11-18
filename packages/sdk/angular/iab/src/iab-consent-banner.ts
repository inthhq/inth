import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
} from '@angular/core';
import type { Signal } from '@angular/core';
import {
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	FocusTrap,
	Portal,
	ScrollLock,
	SURFACE_SCOPES,
	ɵbannerVisibility as bannerVisibility,
	ɵBranding as Branding,
	ɵNoStyleScope as NoStyleScope,
	ɵOverlay as Overlay,
	ɵresolveNoStyle as resolveNoStyle,
	ɵshouldShowBranding as shouldShowBranding,
} from '@inth/angular';
import type { Model } from '@inth/sdk/engine';
import { resolveIABBannerSummary } from '@inth/sdk/iab-support';
import { saveIABConsentSurface } from '@inth/sdk/surface-actions';
import { resolveConsentPresentation } from '@inth/sdk/surface-state';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import actionStyles from '@inth/sdk/ui/styles/components/consent-actions';
import styles from '@inth/sdk/ui/styles/components/iab-consent-banner';
import {
	getTextDirection,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

import { IAB_FIRST_PAINT_SHEETS } from './iab-first-paint-sheets';
import { getIABTranslations } from './iab-translations';

type IABBannerSummary = ReturnType<typeof resolveIABBannerSummary>;

/** A button on the IAB banner. */
export type IABBannerButton = 'reject' | 'accept' | 'customize';

/**
 * The IAB TCF 2.4 consent banner: the first layer of a TCF CMP.
 *
 * It lists the purposes and the partner count from the Global Vendor List,
 * and offers Accept all, Reject all and Customize. Customize opens
 * `<inth-iab-consent-dialog>` on the purposes tab; the partners link opens
 * it on the vendors tab.
 *
 * Renders when the provider has `iab` configured, the resolved policy uses
 * the `iab` model and the banner is the active surface. Put it next to
 * `<inth-iab-consent-dialog>` once, near the root of the app.
 *
 * @example
 * ```html
 * <inth-iab-consent-banner />
 * <inth-iab-consent-dialog />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [Branding, FocusTrap, Overlay, Portal, ScrollLock],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-iab-consent-banner',
	template: `
		@if (visibility.shouldRender() && summary().isReady) {
			@let iabT = translations();
			<div inthPortal>
				@if (presentation().blocking) {
					<div
						inth-overlay
						[styles]="styles"
						[variant]="'iab-banner'"
						[entering]="!resolvedDisableAnimation()"
						[lateEntry]="visibility.lateEntry() && !resolvedDisableAnimation()"
						[visible]="visibility.isVisible()"
					></div>
				}
				<div
					[class]="surfaceClass()"
					[attr.style]="rootStyle()"
					[attr.dir]="textDirection()"
					data-position="bottom-left"
					[attr.data-entry]="
						visibility.lateEntry() && !resolvedDisableAnimation()
							? 'late'
							: null
					"
					data-testid="iab-consent-banner-root"
					data-inth-streamed=""
					tabindex="-1"
					[inthScrollLock]="presentation().blocking"
				>
					<div [class]="cls(styles.cardShell)">
						@if (showBranding()) {
							<a
								inth-branding
								[noStyle]="resolvedNoStyle()"
								surface="iab-banner"
							></a>
						}
						<div
							[class]="cardStyle().className || ''"
							[attr.style]="toStyle(cardStyle().style)"
							data-testid="iab-consent-banner-card"
							[attr.role]="presentation().blocking ? 'dialog' : 'region'"
							[attr.aria-modal]="presentation().blocking ? 'true' : null"
							[attr.aria-label]="iabT.banner.title"
							[inthFocusTrap]="presentation().blocking"
						>
							<div
								[class]="headerStyle().className || ''"
								[attr.style]="toStyle(headerStyle().style)"
								data-testid="iab-consent-banner-header"
							>
								<h2 [class]="cls(styles.title)">{{ iabT.banner.title }}</h2>
								<p [class]="cls(styles.description)">
									{{ descriptionParts()[0]
									}}<button
										type="button"
										[class]="cls(styles.partnersLink)"
										data-testid="iab-consent-banner-partners-link"
										(click)="openVendors()"
									>
										{{ partnersLinkText() }}</button
									>{{ descriptionParts()[1] ?? '' }}
								</p>
								<ul [class]="cls(styles.purposeList)">
									@for (name of summary().displayItems; track name) {
										<li>{{ name }}</li>
									}
									@if (summary().remainingCount > 0) {
										<li [class]="cls(styles.purposeMore)">
											{{
												iabT.banner.andMore.replace(
													'{count}',
													'' + summary().remainingCount
												)
											}}
										</li>
									}
								</ul>
								<p [class]="cls(styles.legitimateInterestNotice)">
									{{ iabT.banner.legitimateInterestNotice }}
									{{ iabT.banner.scopeServiceSpecific }}
								</p>
							</div>

							<div
								[class]="footerStyle().className || ''"
								[attr.style]="toStyle(footerStyle().style)"
								data-testid="iab-consent-banner-footer"
								data-direction="row"
								data-split="true"
							>
								<div
									[class]="cls(actionStyles.actionGroup)"
									data-direction="row"
								>
									<button
										type="button"
										[class]="cls(buttonStyles.button)"
										[attr.data-mode]="buttonMode('reject')"
										data-size="small"
										[attr.data-variant]="buttonVariant('reject')"
										(click)="rejectAll()"
										data-action="reject"
										data-testid="iab-consent-banner-reject-button"
									>
										{{ iabT.common.rejectAll }}
									</button>
									<button
										type="button"
										[class]="cls(buttonStyles.button)"
										[attr.data-mode]="buttonMode('accept')"
										data-size="small"
										[attr.data-variant]="buttonVariant('accept')"
										(click)="acceptAll()"
										data-action="accept"
										data-testid="iab-consent-banner-accept-button"
									>
										{{ iabT.common.acceptAll }}
									</button>
								</div>
								<div
									[class]="cls(actionStyles.actionGroup)"
									data-direction="row"
								>
									<button
										type="button"
										[class]="cls(buttonStyles.button)"
										[attr.data-mode]="buttonMode('customize')"
										data-size="small"
										[attr.data-variant]="buttonVariant('customize')"
										(click)="openPurposes()"
										data-action="customize"
										data-testid="iab-consent-banner-customize-button"
									>
										{{ iabT.common.customize }}
									</button>
								</div>
							</div>
						</div>
					</div>
					<!-- The end of the banner's markup; see the stock banner. -->
					<span
						data-inth-stream-end=""
						hidden
					></span>
				</div>
			</div>
		}
	`,
})
export class IABConsentBanner {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip enter and exit motion. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/**
	 * Lock page scrolling while the banner shows. Overrides the provider's
	 * option; the policy's presentation can still make the banner blocking.
	 */
	readonly scrollLock = input<boolean | undefined>(undefined);
	/** Trap focus in the banner. Overrides the provider's option. */
	readonly trapFocus = input<boolean | undefined>(undefined);
	/** Hide the "Secured by" attribution. */
	readonly hideBranding = input(false);
	/** The button drawn as the primary action. */
	readonly primaryButton = input<IABBannerButton>('customize');
	/** The policy models the banner renders for. */
	readonly models = input<readonly Model[]>(['iab']);
	/** Extra class for the banner root. */
	readonly rootClass = input<string | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly buttonStyles = buttonStyles;
	/** @internal */
	protected readonly actionStyles = actionStyles;

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly resolvedDisableAnimation = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);
	/** @internal */
	protected readonly presentation = computed(() =>
		resolveConsentPresentation({
			override: { scrollLock: this.scrollLock(), trapFocus: this.trapFocus() },
			policy: this.#consent.snapshot().policyRule,
			presentation: {
				prompt: {
					scrollLock: this.#theme.scrollLock(),
					trapFocus: this.#theme.trapFocus(),
					...this.#consent.presentation()?.prompt,
				},
			},
			surface: 'prompt',
		})
	);
	readonly #iab = this.#consent.iab;
	/** @internal */
	protected readonly translations = computed(() =>
		getIABTranslations(this.#consent.translationConfig())
	);
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.#consent.translationConfig().defaultLanguage)
	);
	readonly #shouldShow = computed(
		() =>
			this.#consent.hasConsentUi() &&
			this.#consent.activeUI() === 'banner' &&
			this.models().includes(this.#consent.model()) &&
			this.#iab()?.config.enabled === true
	);
	/** @internal */
	protected readonly visibility = bannerVisibility(() => this.#shouldShow());
	/** @internal */
	protected readonly summary: Signal<IABBannerSummary> = computed(() =>
		resolveIABBannerSummary(this.#iab())
	);
	/** @internal */
	protected readonly showBranding = computed(() =>
		shouldShowBranding(this.#consent.branding(), this.hideBranding())
	);

	readonly #rootStyle = computed(() =>
		resolveStyles(
			'iabConsentBanner',
			this.#theme.theme(),
			{
				baseClassName: styles.root,
				className: this.rootClass(),
				noStyle: this.resolvedNoStyle(),
			},
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly rootStyle = computed(() =>
		toStyleAttributeValue(this.#rootStyle().style)
	);
	/** @internal */
	protected readonly surfaceClass = computed(() => {
		const base = this.#rootStyle().className || '';
		if (this.resolvedNoStyle()) {
			return base;
		}
		if (!this.visibility.isVisible()) {
			return `${base} ${styles.bannerHidden}`;
		}
		return `${base} ${styles.bannerVisible}${this.resolvedDisableAnimation() ? '' : ` ${styles.bannerEntering}`}`;
	});
	/** @internal */
	protected readonly cardStyle = computed(() =>
		resolveStyles(
			'iabConsentBannerCard',
			this.#theme.theme(),
			{ baseClassName: styles.card, noStyle: this.resolvedNoStyle() },
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly headerStyle = computed(() =>
		resolveStyles(
			'iabConsentBannerHeader',
			this.#theme.theme(),
			{ baseClassName: styles.header, noStyle: this.resolvedNoStyle() },
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly footerStyle = computed(() =>
		resolveStyles(
			'iabConsentBannerFooter',
			this.#theme.theme(),
			{
				baseClassName: [styles.footer, actionStyles.actionRoot],
				noStyle: this.resolvedNoStyle(),
			},
			this.resolvedNoStyle()
		)
	);

	/** @internal */
	protected readonly partnersLinkText = computed(() =>
		(this.translations().banner.partnersLink ?? '').replace(
			'{count}',
			String(this.summary().vendorCount)
		)
	);
	/** The description, split around the partners link. @internal */
	protected readonly descriptionParts = computed(() =>
		this.translations()
			.banner.description.replace(
				'{partnerCount}',
				String(this.summary().vendorCount)
			)
			.split(this.partnersLinkText())
	);

	constructor() {
		effect(() => {
			if (this.visibility.shouldRender()) {
				this.#styles.ensure(
					IAB_FIRST_PAINT_SHEETS,
					this.resolvedNoStyle(),
					SURFACE_SCOPES.iabBanner
				);
			}
		});
	}

	/** @internal */
	protected toStyle(style: Parameters<typeof toStyleAttributeValue>[0]) {
		return toStyleAttributeValue(style) ?? null;
	}

	/** @internal */
	protected cls(name: string | undefined): string {
		return this.resolvedNoStyle() ? '' : name || '';
	}

	/**
	 * The shared button stylesheet keys its variants off `data-*`, the way
	 * every other consent button does.
	 *
	 * @internal
	 */
	protected buttonMode(button: IABBannerButton): string {
		return button === this.primaryButton() && button !== 'reject'
			? 'filled'
			: 'stroke';
	}

	/** @internal */
	protected buttonVariant(button: IABBannerButton): string {
		return button === this.primaryButton() ? 'primary' : 'neutral';
	}

	/** @internal */
	protected async acceptAll(): Promise<void> {
		this.#iab()?.acceptAll();
		await this.#save();
	}

	/** @internal */
	protected async rejectAll(): Promise<void> {
		this.#iab()?.rejectAll();
		await this.#save();
	}

	/** @internal */
	protected openPurposes(): void {
		this.#iab()?.setPreferenceCenterTab('purposes');
		this.#consent.setActiveUI('dialog');
	}

	/** @internal */
	protected openVendors(): void {
		this.#iab()?.setPreferenceCenterTab('vendors');
		this.#consent.setActiveUI('dialog');
	}

	async #save(): Promise<void> {
		const state = this.#iab();
		if (!state) {
			return;
		}
		try {
			await saveIABConsentSurface(this.#consent.kernel(), () => state.save());
		} catch {
			// Keep the prompt available so a later action can retry the failed load/save.
		}
	}
}
