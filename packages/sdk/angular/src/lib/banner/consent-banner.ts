import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	DestroyRef,
	effect,
	inject,
	input,
	isDevMode,
	PLATFORM_ID,
} from '@angular/core';
import type { Model, PromptPosition, PromptVariant } from '@inth/sdk/engine';
import { actionAppearanceFromTheme } from '@inth/sdk/engine';
import type { PolicyRight } from '@inth/sdk/schema/types';
import {
	activateOptOutLink,
	replayEarlyConsentTaps,
} from '@inth/sdk/surface-actions';
import {
	resolveActionLabels,
	resolveConsentPresentation,
	resolveOptOutLink,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-banner';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import {
	resolveLegalLinkEntries,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';
import { getTextDirection } from '@inth/sdk/ui/utils/text-direction';

import { ConsentManager } from '../core/consent-manager';
import {
	BANNER_SHEETS,
	ConsentStyles,
	SURFACE_SCOPES,
} from '../core/consent-styles';
import { ConsentTheme } from '../core/consent-theme';
import { NoStyleScope, resolveNoStyle } from '../core/no-style';
import { FocusTrap } from '../overlay/focus-trap';
import { Overlay } from '../overlay/overlay';
import { Portal } from '../overlay/portal';
import { ScrollLock } from '../overlay/scroll-lock';
import { Branding, shouldShowBranding } from '../shared/branding';
import { ConsentButton } from '../shared/consent-button';
import { OptOutIcon } from '../shared/icons';
import { InlineLegalLinks } from '../shared/inline-legal-links';
import type { LegalLinkSelection } from '../shared/inline-legal-links';
import { PolicyActions } from '../shared/policy-actions';
import {
	ConsentBannerAction,
	ConsentBannerDescription,
	ConsentBannerTitle,
} from './banner-templates';
import type {
	BannerActionContext,
	ConsentBannerButton,
} from './banner-templates';
import { bannerVisibility } from './banner-visibility';

/** Action groups for the banner footer: one id, or ids grouped together. */
export type ConsentBannerLayout = (
	| ConsentBannerButton
	| ConsentBannerButton[]
)[];

const BANNER_ACTIONS = new Set<string>([
	'reject',
	'accept',
	'customize',
	'dismiss',
]);

// As React's banner: IAB policies belong to <inth-iab-consent-banner>, so
// the two render side by side without both showing.
const DEFAULT_MODELS: readonly Model[] = ['opt-in', 'opt-out'];

const primaryActions = function primaryActions(
	primary: ConsentBannerButton | ConsentBannerButton[] | undefined
): ConsentBannerButton[] | undefined {
	if (primary === undefined) {
		return undefined;
	}
	return Array.isArray(primary) ? primary : [primary];
};

/**
 * The cookie banner: the first prompt a visitor sees while a choice or a
 * notice is required.
 *
 * Shows while `ConsentManager.activeUI()` is `'banner'`. The policy decides
 * the copy (choice or notice), which actions show and how they group; the
 * inputs override the presentation. It renders into `<body>`, adds its own
 * stylesheet unless `noStyle` or the provider's `styles: false` is set, and
 * reads the provider's theme slots (`consentBanner*`).
 *
 * Content between the tags lands in the footer before the action groups.
 * `<ng-template inthConsentBannerTitle>`, `inthConsentBannerDescription` and
 * `inthConsentBannerAction` replace the title, the description and each button.
 *
 * @example
 * ```html
 * <inth-consent-banner
 *   [legalLinks]="['privacyPolicy']"
 *   variant="bar"
 *   position="bottom"
 * />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		Branding,
		ConsentButton,
		FocusTrap,
		InlineLegalLinks,
		NgTemplateOutlet,
		OptOutIcon,
		Overlay,
		PolicyActions,
		Portal,
		ScrollLock,
	],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-consent-banner',
	template: `
		@if (visibility.shouldRender()) {
			<div inthPortal>
				@if (presentation().scrollLock) {
					<div
						inth-overlay
						[styles]="styles"
						[entering]="!resolvedDisableAnimation()"
						[lateEntry]="visibility.lateEntry() && !resolvedDisableAnimation()"
						[visible]="visibility.isVisible()"
					></div>
				}
				<div
					[class]="surfaceClass()"
					[style]="rootStyle()"
					[attr.dir]="textDirection()"
					[attr.data-variant]="presentation().variant"
					[attr.data-position]="presentation().position"
					[attr.data-blocking]="presentation().blocking ? 'true' : null"
					[attr.data-prompt]="promptKind()"
					[attr.data-model]="consent.model()"
					[attr.data-entry]="
						visibility.lateEntry() && !resolvedDisableAnimation()
							? 'late'
							: null
					"
					data-testid="consent-banner-root"
					data-inth-surface="banner"
					data-inth-streamed=""
					[inthScrollLock]="presentation().scrollLock"
				>
					<div [class]="resolvedNoStyle() ? '' : styles.cardShell || ''">
						@if (showBranding()) {
							<a
								inth-branding
								[noStyle]="resolvedNoStyle()"
								[surface]="'banner'"
							></a>
						}
						<div
							[class]="part().card.className"
							[style]="part().card.style"
							data-testid="consent-banner-card"
							tabindex="-1"
							[attr.role]="presentation().blocking ? 'dialog' : 'region'"
							[attr.aria-modal]="presentation().blocking ? 'true' : null"
							[attr.aria-label]="resolvedHeading()"
							[inthFocusTrap]="presentation().trapFocus"
						>
							<div
								[class]="part().header.className"
								[style]="part().header.style"
								data-testid="consent-banner-header"
							>
								<h2
									[class]="part().title.className"
									[style]="part().title.style"
									data-testid="consent-banner-title"
								>
									@if (titleTemplate(); as custom) {
										<ng-container
											[ngTemplateOutlet]="custom.template"
											[ngTemplateOutletContext]="{
												$implicit: resolvedHeading(),
												notice: isNotice(),
											}"
										/>
									} @else {
										{{ resolvedHeading() }}
									}
								</h2>
								<div
									[class]="part().description.className"
									[style]="part().description.style"
									data-context="banner"
									data-testid="consent-banner-description"
								>
									@if (descriptionTemplate(); as custom) {
										<ng-container
											[ngTemplateOutlet]="custom.template"
											[ngTemplateOutletContext]="{
												$implicit: resolvedDescription(),
												notice: isNotice(),
											}"
										/>
									} @else {
										{{ resolvedDescription() }}
									}
									@if (hasLegalLinks()) {
										<span
											inth-inline-legal-links
											[links]="legalLinks()"
											[testIdPrefix]="'consent-banner-legal-link'"
										></span>
									}
								</div>
							</div>
							<div
								inth-policy-actions
								[actionGroups]="presentation().actionGroups"
								[primaryActions]="presentation().primaryActions"
								[shouldFillActions]="presentation().shouldFillActions"
								[direction]="presentation().direction"
								[noStyle]="resolvedNoStyle()"
								[footerClassName]="part().footer.className"
								[footerStyle]="part().footer.style"
								[groupClassName]="part().footerSubGroup.className"
								[groupStyle]="part().footerSubGroup.style"
								[footerTestId]="'consent-banner-footer'"
								[groupTestId]="'consent-banner-footer-sub-group'"
								[action]="actionTemplate"
							>
								@if (presentation().preferenceControls.length > 0) {
									<div
										[class]="part().rights.className"
										[style]="part().rights.style"
										data-testid="consent-banner-rights"
									>
										@for (
											right of presentation().preferenceControls;
											track right
										) {
											<button
												type="button"
												[class]="part().rightLink.className"
												[style]="part().rightLink.style"
												data-action="right"
												[attr.data-opt-out-variant]="
													right === 'opt-out' ? optOutLink().variant : null
												"
												[attr.data-right]="right"
												[attr.data-inth-rights]="rights()"
												[attr.data-testid]="
													'consent-banner-right-link-' + right
												"
												(click)="onRightClick(right)"
											>
												@if (
													right === 'opt-out' &&
													optOutLink().variant === 'privacy-choices'
												) {
													<svg
														inth-opt-out-icon
														[class]="
															resolvedNoStyle() ? '' : styles.optOutIcon || ''
														"
													></svg>
												}
												{{
													right === 'opt-out'
														? optOutLink().label
														: (rightLabels()[right] ?? right)
												}}
											</button>
										}
									</div>
								}
								<ng-content />
							</div>
						</div>
					</div>
					<!-- The end of the banner's markup: the stylesheet keeps the
					banner hidden until it arrives, so a page whose HTML arrives
					in pieces never paints a partial banner that then grows. -->
					<span
						data-inth-stream-end=""
						hidden
					></span>
				</div>
			</div>
		}
		<ng-template
			#actionTemplate
			let-action
			let-primary="primary"
		>
			@if (actionContext(action, primary); as context) {
				@if (customAction(); as custom) {
					<ng-container
						[ngTemplateOutlet]="custom.template"
						[ngTemplateOutletContext]="context"
					/>
				} @else {
					<button
						inth-consent-button
						[action]="context.$implicit"
						[variant]="context.variant"
						[mode]="context.mode"
						[attr.data-action]="context.$implicit"
						[attr.data-testid]="context.testId"
					>
						{{ context.label }}
					</button>
				}
			}
		</ng-template>
	`,
})
export class ConsentBanner {
	/** @internal */
	protected readonly consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip the fade-in of a banner that shows after the page painted. The
	 * banner leaves at once either way. Defaults to the provider's setting.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Lock page scrolling while shown. Overrides the presentation. */
	readonly scrollLock = input<boolean | undefined>(undefined);
	/** Trap focus in the banner. Overrides the presentation. */
	readonly trapFocus = input<boolean | undefined>(undefined);
	/** The heading text. Defaults to the translation. */
	readonly heading = input<string | undefined>(undefined);
	/** The description. Defaults to the translation. */
	readonly description = input<string | undefined>(undefined);
	/** The Reject button's text. */
	readonly rejectButtonText = input<string | undefined>(undefined);
	/** The Customize button's text. */
	readonly customizeButtonText = input<string | undefined>(undefined);
	/** The Accept button's text. */
	readonly acceptButtonText = input<string | undefined>(undefined);
	/** The notice's acknowledge button text. */
	readonly dismissButtonText = input<string | undefined>(undefined);
	/** Hide the "Secured by" attribution. */
	readonly hideBranding = input(false);
	/** Which of the provider's legal links follow the description. */
	readonly legalLinks = input<LegalLinkSelection | undefined>(undefined);
	/** Action groups for the footer. Overrides the presentation. */
	readonly layout = input<ConsentBannerLayout | undefined>(undefined);
	/** The action or actions styled as primary. */
	readonly primaryButton = input<
		ConsentBannerButton | ConsentBannerButton[] | undefined
	>(undefined);
	/**
	 * Shape of the prompt. Overrides the presentation. A notice defaults
	 * to `bar`, a choice prompt to `floating`.
	 */
	readonly variant = input<PromptVariant | undefined>(undefined);
	/**
	 * Where the prompt sits. Must be valid for the resolved variant; an
	 * invalid value falls back to the variant default with a development
	 * warning.
	 */
	readonly position = input<PromptPosition | undefined>(undefined);
	/**
	 * Backdrop, scroll lock, focus trap and no dismissal from outside, as
	 * one value. `wall` is always blocking; a notice never is.
	 */
	readonly blocking = input<boolean | undefined>(undefined);
	/** The consent models the banner shows for. */
	readonly models = input<readonly Model[]>(DEFAULT_MODELS);
	/** Extra class for the banner root. */
	readonly rootClass = input<string | undefined>(undefined);

	/** @internal */
	protected readonly titleTemplate = contentChild(ConsentBannerTitle);
	/** @internal */
	protected readonly descriptionTemplate = contentChild(
		ConsentBannerDescription
	);
	/** @internal */
	protected readonly customAction = contentChild(ConsentBannerAction);

	/** @internal */
	protected readonly styles = styles;

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly resolvedDisableAnimation = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);

	readonly #translations = this.consent.copy;
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.consent.translations()?.language)
	);

	readonly #shouldShow = computed(
		() =>
			this.consent.hasConsentUi() &&
			this.consent.activeUI() === 'banner' &&
			this.consent.promptRequirement().kind !== 'none' &&
			this.models().includes(this.consent.model())
	);

	/** @internal */
	protected readonly visibility = bannerVisibility(() => this.#shouldShow());

	/** @internal */
	protected readonly presentation = computed(() => {
		const primary = this.primaryButton();
		const presentation = this.consent.presentation();
		return resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(this.#theme.theme()),
			override: {
				blocking: this.blocking(),
				layout: this.layout(),
				position: this.position(),
				primaryActions: primaryActions(primary),
				scrollLock: this.scrollLock(),
				trapFocus: this.trapFocus(),
				variant: this.variant(),
			},
			policy: this.consent.snapshot().policyRule,
			presentation: {
				...presentation,
				prompt: {
					scrollLock: this.#theme.scrollLock(),
					trapFocus: this.#theme.trapFocus(),
					...presentation?.prompt,
				},
			},
			surface: 'prompt',
		});
	});

	/** @internal */
	protected readonly promptKind = computed(
		() => this.consent.snapshot().policyRule.prompt
	);
	/** @internal */
	protected readonly isNotice = computed(() => this.promptKind() === 'notice');
	/** @internal */
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);

	/** @internal */
	protected readonly showBranding = computed(() =>
		shouldShowBranding(this.consent.branding(), this.hideBranding())
	);
	/** @internal */
	protected readonly hasLegalLinks = computed(
		() =>
			resolveLegalLinkEntries(this.consent.legalLinks(), this.legalLinks())
				.length > 0
	);

	readonly #promptCopy = computed(() =>
		resolvePromptCopy(this.#translations(), this.promptKind())
	);

	/** @internal */
	protected readonly resolvedHeading = computed(
		() => this.heading() ?? this.#promptCopy().title
	);
	/** @internal */
	protected readonly resolvedDescription = computed(
		() => this.description() ?? this.#promptCopy().description
	);
	/** @internal */
	protected readonly rightLabels = computed(
		(): Partial<Record<PolicyRight, string | undefined>> =>
			resolvePreferenceControlLabels(this.#translations())
	);
	/** @internal */
	protected readonly optOutLink = computed(() =>
		resolveOptOutLink(this.#translations(), this.presentation().optOutLink)
	);
	readonly #labels = computed(() => {
		const labels = resolveActionLabels(this.#translations());
		return {
			accept: this.acceptButtonText() ?? labels.accept,
			customize: this.customizeButtonText() ?? labels.customize,
			// Acknowledgement records no category choice.
			dismiss: this.dismissButtonText() ?? labels.dismiss,
			reject: this.rejectButtonText() ?? labels.reject,
		} satisfies Record<ConsentBannerButton, string>;
	});

	readonly #parts = computed(() => {
		const noStyle = this.resolvedNoStyle();
		const theme = this.#theme.theme();
		const resolve = (
			key: Parameters<typeof resolveStyles>[0],
			baseClassName: string | undefined,
			className?: string
		) =>
			resolveStyles(key, theme, { baseClassName, className, noStyle }, noStyle);
		return {
			card: resolve('consentBannerCard', styles.card),
			description: resolve('consentBannerDescription', styles.description),
			footer: resolve('consentBannerFooter', styles.footer),
			footerSubGroup: resolve('consentBannerFooterSubGroup', undefined),
			header: resolve('consentBannerHeader', styles.header),
			rightLink: resolve('consentBannerRightLink', styles.rightLink),
			rights: resolve('consentBannerRights', styles.rights),
			root: resolve('consentBanner', styles.root, this.rootClass()),
			title: resolve('consentBannerTitle', styles.title),
		};
	});

	/** Each part's class and `style` attribute. @internal */
	protected readonly part = computed(() => {
		const parts = this.#parts();
		const out = {} as Record<
			keyof typeof parts,
			{ className: string; style: string }
		>;
		for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
			out[key] = {
				className: parts[key].className || '',
				style: toStyleAttributeValue(parts[key].style) ?? '',
			};
		}
		return out;
	});

	/** @internal */
	protected readonly rootStyle = computed(() => this.part().root.style);
	/** @internal */
	protected readonly surfaceClass = computed(() => {
		const base = this.part().root.className;
		if (this.resolvedNoStyle()) {
			return base;
		}
		if (!this.visibility.isVisible()) {
			return `${base} ${styles.bannerHidden}`;
		}
		return `${base} ${styles.bannerVisible}${
			this.resolvedDisableAnimation() ? '' : ` ${styles.bannerEntering}`
		}`;
	});

	constructor() {
		// Before the first paint, and again when `noStyle` turns off.
		effect(() => {
			this.#styles.ensure(
				BANNER_SHEETS,
				this.resolvedNoStyle(),
				SURFACE_SCOPES.banner
			);
		});
		if (isDevMode()) {
			effect(() => {
				for (const diagnostic of this.presentation().diagnostics) {
					console.warn(diagnostic.message);
				}
			});
		}
		if (isPlatformBrowser(inject(PLATFORM_ID))) {
			this.#replayEarlyTaps();
		}
	}

	/**
	 * A tap on the server-rendered banner before the app hydrated is held by
	 * the script `provideInthServer()` adds. From the first browser render
	 * the banner's own handlers work: stop the script and record its tap
	 * once the runtime has started.
	 */
	#replayEarlyTaps(): void {
		let stop: (() => void) | undefined;
		afterNextRender(() => {
			stop = replayEarlyConsentTaps(this.consent.kernel(), {
				categories: () => this.consent.consentCategories(),
				started: () => this.consent.runtime.started,
			});
		});
		inject(DestroyRef).onDestroy(() => stop?.());
	}

	/**
	 * The context one footer action renders with, or `null` for an action
	 * the banner does not offer.
	 *
	 * @internal
	 */
	protected actionContext(
		action: string,
		primary: boolean
	): BannerActionContext | null {
		if (!BANNER_ACTIONS.has(action)) {
			return null;
		}
		const id = action as ConsentBannerButton;
		const { mode, variant } = resolveActionAppearance(
			this.#theme.theme(),
			id,
			primary
		);
		return {
			$implicit: id,
			label: this.#labels()[id] ?? '',
			mode,
			primary,
			testId: `consent-banner-${id}-button`,
			variant,
		};
	}

	/**
	 * Handle a persistent-right control click according to the resolved
	 * opt-out link variant, or open the preference center for `'preferences'`.
	 *
	 * @internal
	 */
	protected onRightClick(right: PolicyRight): void {
		if (right === 'opt-out') {
			void activateOptOutLink(
				this.consent.kernel(),
				this.optOutLink().variant,
				{ uiSource: 'banner' }
			);
			return;
		}
		this.consent.setActiveUI('dialog');
	}
}
