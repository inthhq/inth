/**
 * The Privacy Choices consent prompt (v6): a Card, Banner or Drawer that
 * shows the same content, copy and decisions in every presentation. The
 * modules beside this file (`card.ts`, `bar.ts`, `drawer.ts`) name the
 * stylesheets of one presentation each, so a page downloads only the
 * presentation it renders.
 *
 * @packageDocumentation
 */

import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
	afterNextRender,
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	linkedSignal,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { commitBannerChoice, resolveOptOutState } from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	ResolvedConsentLayout,
} from '@inth/sdk/engine';
import {
	announcementText,
	resolveBannerAllowedAnnouncement,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
} from '@inth/sdk/surface-state';
import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
import {
	afterMotion,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';
import type { AllThemeKeys } from '@inth/sdk/ui/theme';
import { resolveBrandingTag, tabbableElements } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../../core/consent-styles';
import { ConsentTheme } from '../../core/consent-theme';
import { registerDialogWarmer, warmDialog } from '../../core/dialog-warming';
import { NoStyleScope, resolveNoStyle } from '../../core/no-style';
import { uniqueId } from '../../core/unique-id';
import { ChoiceButton } from '../../privacy-choices/choice-button';
import { bool, cx, slotPart } from '../../privacy-choices/parts';
import { SurfaceDraft } from '../../privacy-choices/surface-draft';
import {
	injectPhoneLayout,
	injectSurfaceSession,
	rightsBundleOf,
} from '../../privacy-choices/surface-session';
import { BrandMarkIcon } from '../../shared/icons';
import { InlineLegalLinks } from '../../shared/inline-legal-links';
import type { LegalLinkSelection } from '../../shared/inline-legal-links';
import { PrivacyChoicesPanel } from './panel';
import type {
	PresentationModule,
	PrivacyChoicesBannerOptions,
} from './presentation';

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;

const CARD_LINKS: LegalLinkSelection = ['privacyPolicy', 'cookiePolicy'];

/**
 * Where focus goes after a choice (BNR-06, ARCH-03): the page's "Your
 * Privacy Choices" control. Angular's `[inthConsentDialogLink]` takes the
 * place of React's `PrivacyChoicesLink`.
 */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
	'[data-testid="consent-dialog-link"]',
];

/** Move focus to "Your Privacy Choices", or leave it where it is. */
const focusReturnTarget = function focusReturnTarget(): void {
	for (const selector of RETURN_TARGETS) {
		const target = document.querySelector<HTMLElement>(selector);
		if (target) {
			target.focus({ preventScroll: true });
			return;
		}
	}
};

type Phase = 'hidden' | 'shown' | 'leaving';

/**
 * The Privacy Choices prompt for one presentation. Its own draft backs the
 * category switches, so Save records exactly what the options show.
 *
 * Loaded by the stock `<inth-consent-banner>` when the design opts in; it
 * stays mounted after its first show, so its exit, the page announcement
 * and the focus return outlive the prompt.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [
		BrandMarkIcon,
		ChoiceButton,
		InlineLegalLinks,
		NgTemplateOutlet,
		PrivacyChoicesPanel,
	],
	providers: [NoStyleScope, SurfaceDraft],
	selector: 'inth-pc-surface',
	template: `<!-- The page's status region outlives the prompt, so the outcome
		of a choice is read after the prompt leaves (BNR-06). It keeps its node. -->
		<div
			#pageRegion
			[attr.class]="surfaceStyles.visuallyHidden"
			data-testid="consent-banner-announcement"
		></div>
		@if (showing()) {
			<div
				#root
				[attr.class]="rootPart().className"
				[attr.style]="rootPart().style"
				[attr.data-placement]="layout().placement"
				[attr.data-flow]="layout().flow"
				[attr.data-edge-style]="layout().edgeStyle"
				[attr.data-blocking]="layout().blocking ? 'true' : null"
				[attr.data-expanded]="expanded() ? 'true' : null"
				[attr.data-state]="phase() === 'leaving' ? 'closed' : 'open'"
				[attr.data-variant]="variant()"
				data-design="privacy-choices"
				data-testid="consent-banner-root"
				[attr.inert]="phase() === 'leaving' ? '' : null"
			>
				@if (layout().blocking) {
					<div
						[attr.class]="
							part('consentBannerOverlay', surfaceStyles.scrim).className
						"
						[attr.style]="part('consentBannerOverlay').style"
						aria-hidden="true"
						data-testid="consent-banner-overlay"
					></div>
				}
				<div
					#shell
					[attr.class]="cx(surfaceStyles.shell, presentationStyles().shell)"
					[attr.role]="layout().blocking ? 'dialog' : null"
					[attr.aria-modal]="layout().blocking ? 'true' : null"
					[attr.aria-labelledby]="layout().blocking ? ids.title : null"
					data-testid="consent-banner-shell"
				>
					@if (!allInOne()) {
						<ng-container [ngTemplateOutlet]="tagTemplate" />
					}
					<section
						#card
						[attr.class]="
							part(
								'consentBannerCard',
								surfaceStyles.card,
								presentationStyles().card
							).className
						"
						[attr.style]="part('consentBannerCard').style"
						[attr.role]="layout().blocking ? null : 'region'"
						[attr.aria-labelledby]="layout().blocking ? null : ids.title"
						tabindex="-1"
						data-testid="consent-banner-card"
					>
						@if (barCollapsed()) {
							<h2
								[attr.class]="cx(surfaceStyles.visuallyHidden)"
								[attr.id]="ids.title"
								data-testid="consent-banner-title"
							>
								{{ options().heading ?? copy().title }}
							</h2>
							<div [attr.class]="cx(presentationStyles().row)">
								<p
									[attr.class]="cx(presentationStyles().text)"
									data-testid="consent-banner-description"
								>
									{{ options().description ?? copy().barDescription }}
									@if (barLinks().length > 0) {
										<span
											inth-inline-legal-links
											[links]="barLinks()"
											[testIdPrefix]="'consent-banner-legal-link'"
										></span>
									}
								</p>
								<div
									[attr.class]="cx(presentationStyles().actions)"
									data-testid="consent-banner-footer"
								>
									@if (!notice()) {
										<ng-container
											[ngTemplateOutlet]="refuseTemplate"
											[ngTemplateOutletContext]="{ $implicit: copy().reject }"
										/>
										<ng-container
											[ngTemplateOutlet]="allowTemplate"
											[ngTemplateOutletContext]="{ $implicit: copy().accept }"
										/>
									}
									<ng-container
										[ngTemplateOutlet]="expandTemplate"
										[ngTemplateOutletContext]="{
											$implicit:
												options().customizeButtonText ?? copy().expandBar,
											inBar: true,
										}"
									/>
									@if (notice()) {
										<ng-container [ngTemplateOutlet]="okTemplate" />
									}
								</div>
							</div>
							<ng-container [ngTemplateOutlet]="statusTemplate" />
						} @else {
							<div
								[attr.class]="
									part(
										'consentBannerHeader',
										surfaceStyles.head,
										presentationStyles().head
									).className
								"
								[attr.style]="part('consentBannerHeader').style"
								data-testid="consent-banner-header"
							>
								<h2
									[attr.class]="
										part('consentBannerTitle', surfaceStyles.title).className
									"
									[attr.style]="part('consentBannerTitle').style"
									[attr.id]="ids.title"
									data-testid="consent-banner-title"
								>
									{{ options().heading ?? copy().title }}
								</h2>
								<p
									[attr.class]="
										part('consentBannerDescription', surfaceStyles.description)
											.className
									"
									[attr.style]="part('consentBannerDescription').style"
									data-testid="consent-banner-description"
								>
									{{ options().description ?? copy().description }}
									@if (links().length > 0) {
										<span
											inth-inline-legal-links
											[links]="links()"
											[testIdPrefix]="'consent-banner-legal-link'"
										></span>
									}
								</p>
							</div>
							@if (allInOne()) {
								<div
									[attr.class]="
										part('consentBannerExpand', presentationStyles().body)
											.className
									"
									[attr.style]="part('consentBannerExpand').style"
									data-testid="consent-banner-expand-panel"
								>
									<ng-container [ngTemplateOutlet]="scrollTemplate" />
									@if (showTag()) {
										<div [attr.class]="cx(presentationStyles().tagSlot)">
											<ng-container [ngTemplateOutlet]="tagTemplate" />
										</div>
									}
								</div>
							} @else {
								<div
									[attr.class]="
										part('consentBannerExpand', expandStyles.panel).className
									"
									[attr.style]="part('consentBannerExpand').style"
									[attr.id]="ids.panel"
									[attr.data-open]="bool(expanded())"
									[attr.inert]="expanded() ? null : ''"
									data-testid="consent-banner-expand-panel"
								>
									<div [attr.class]="cx(expandStyles.inner)">
										<ng-container [ngTemplateOutlet]="scrollTemplate" />
									</div>
								</div>
							}
							<ng-container [ngTemplateOutlet]="statusTemplate" />
							<div
								[attr.class]="
									part(
										'consentBannerFooter',
										surfaceStyles.footer,
										presentationStyles().footer
									).className
								"
								[attr.style]="part('consentBannerFooter').style"
								data-testid="consent-banner-footer"
							>
								@if (optionsOpen()) {
									@if (notice()) {
										<ng-container [ngTemplateOutlet]="okTemplate" />
									} @else {
										<ng-container
											[ngTemplateOutlet]="actionGroupTemplate"
											[ngTemplateOutletContext]="{
												reject: copy().rejectExpanded,
												accept: copy().acceptExpanded,
											}"
										/>
										<button
											inth-choice-button
											consentAction="save"
											[primary]="true"
											slot="consentBannerSaveButton"
											data-testid="consent-banner-save-button"
											(click)="commit('save')"
										>
											{{ copy().save }}
										</button>
									}
								} @else if (notice()) {
									<ng-container
										[ngTemplateOutlet]="expandTemplate"
										[ngTemplateOutletContext]="{
											$implicit: options().customizeButtonText ?? copy().expand,
											inBar: false,
										}"
									/>
									<ng-container [ngTemplateOutlet]="okTemplate" />
								} @else {
									<ng-container
										[ngTemplateOutlet]="actionGroupTemplate"
										[ngTemplateOutletContext]="{
											reject: copy().reject,
											accept: copy().accept,
										}"
									/>
									<ng-container
										[ngTemplateOutlet]="expandTemplate"
										[ngTemplateOutletContext]="{
											$implicit: options().customizeButtonText ?? copy().expand,
											inBar: false,
										}"
									/>
								}
							</div>
						}
					</section>
				</div>
			</div>
		}
		<ng-template #tagTemplate>
			@if (tag(); as tag) {
				<a
					[attr.class]="
						part(
							'consentBannerTag',
							surfaceStyles.tag,
							presentationStyles().tag
						).className
					"
					[attr.style]="part('consentBannerTag').style"
					[attr.href]="tag.href"
					target="_blank"
					rel="noreferrer"
					[attr.data-branding]="tag.brand"
					data-testid="consent-banner-branding"
					><span>{{ translations().common.securedBy }}</span
					><svg
						inth-brand-mark-icon
						[mark]="tag.brand === 'inth' ? 'inth' : 'c15t'"
						[attr.class]="cx(surfaceStyles.tagMark)"
					></svg
					><span [attr.class]="cx(surfaceStyles.visuallyHidden)">{{
						tag.brand === 'inth' ? 'Inth' : 'c15t'
					}}</span></a
				>
			}
		</ng-template>
		<ng-template #scrollTemplate>
			<div
				#scroll
				[attr.class]="cx(expandStyles.scroll)"
				data-testid="consent-banner-body"
			>
				@defer (when wantPanel(); prefetch when warmPanel()) {
					<inth-pc-panel
						[variant]="variant()"
						[idPrefix]="idPrefix"
						[uiSource]="'banner'"
						(ready)="panelReady.set(true)"
					/>
				}
			</div>
		</ng-template>
		<ng-template #statusTemplate>
			<output
				[attr.class]="cx(surfaceStyles.visuallyHidden)"
				aria-live="polite"
				aria-atomic="true"
				data-testid="consent-banner-status"
				>{{ statusText() }}</output
			>
		</ng-template>
		<ng-template
			#expandTemplate
			let-label
			let-inBar="inBar"
		>
			@if (notice()) {
				<!-- The notice's rights action reads as a link, in the
				text-on-surface blue in both palettes (VIS-02). -->
				<button
					type="button"
					[attr.class]="cx(surfaceStyles.rightLink)"
					[attr.aria-expanded]="bool(expanded())"
					[attr.aria-controls]="inBar ? null : ids.panel"
					data-testid="consent-banner-right-link-opt-out"
					(click)="expand()"
					(focus)="warm()"
					(pointerenter)="warm()"
				>
					{{ label }}
				</button>
			} @else {
				<button
					inth-choice-button
					consentAction="customize"
					[primary]="true"
					[attr.aria-expanded]="bool(expanded())"
					[attr.aria-controls]="inBar ? null : ids.panel"
					data-testid="consent-banner-customize-button"
					(click)="expand()"
					(focus)="warm()"
					(pointerenter)="warm()"
				>
					{{ label }}
				</button>
			}
		</ng-template>
		<ng-template
			#refuseTemplate
			let-label
		>
			<button
				inth-choice-button
				consentAction="reject"
				data-testid="consent-banner-reject-button"
				(click)="commit('refuse')"
			>
				{{ options().rejectButtonText ?? label }}
			</button>
		</ng-template>
		<ng-template
			#allowTemplate
			let-label
		>
			<button
				inth-choice-button
				consentAction="accept"
				data-testid="consent-banner-accept-button"
				(click)="commit('allow')"
			>
				{{ options().acceptButtonText ?? label }}
			</button>
		</ng-template>
		<ng-template #okTemplate>
			<button
				inth-choice-button
				consentAction="dismiss"
				[primary]="true"
				data-testid="consent-banner-dismiss-button"
				(click)="acknowledge()"
			>
				{{ options().dismissButtonText ?? copy().ok }}
			</button>
		</ng-template>
		<ng-template
			#actionGroupTemplate
			let-reject="reject"
			let-accept="accept"
		>
			<div
				[attr.class]="
					part('consentBannerFooterSubGroup', surfaceStyles.actionGroup)
						.className
				"
				[attr.style]="part('consentBannerFooterSubGroup').style"
				data-testid="consent-banner-footer-sub-group"
			>
				<ng-container
					[ngTemplateOutlet]="refuseTemplate"
					[ngTemplateOutletContext]="{ $implicit: reject }"
				/>
				<ng-container
					[ngTemplateOutlet]="allowTemplate"
					[ngTemplateOutletContext]="{ $implicit: accept }"
				/>
			</div>
		</ng-template>`,
})
export class PrivacyChoicesSurface {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);
	readonly #draft = inject(SurfaceDraft);

	/** What the stock banner passes on. */
	readonly options = input.required<PrivacyChoicesBannerOptions>();
	/** The presentation's stylesheets and class names. */
	readonly presentation = input.required<PresentationModule>();

	/** @internal */
	protected readonly surfaceStyles = surfaceStyles;
	/** @internal */
	protected readonly expandStyles = expandStyles;
	/** @internal */
	protected readonly bool = bool;
	/** @internal */
	protected readonly translations = this.#consent.copy;

	readonly #noStyleInput = computed(() => this.options().noStyle);
	readonly #noStyle = resolveNoStyle(this.#noStyleInput);
	readonly #surface = injectSurfaceSession();
	readonly #phone = injectPhoneLayout();

	/** @internal */
	protected readonly idPrefix = uniqueId('inth-pc');
	/** @internal */
	protected readonly ids = {
		panel: `${this.idPrefix}-panel`,
		title: `${this.idPrefix}-title`,
	};

	private readonly root = viewChild<ElementRef<HTMLElement>>('root');
	private readonly shell = viewChild<ElementRef<HTMLElement>>('shell');
	private readonly card = viewChild<ElementRef<HTMLElement>>('card');
	private readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll');
	private readonly pageRegion =
		viewChild.required<ElementRef<HTMLElement>>('pageRegion');

	/** @internal */
	protected readonly presentationStyles = computed(
		() => this.presentation().styles
	);
	/** @internal */
	protected readonly layout = computed((): ResolvedConsentLayout =>
		this.#phone()
			? this.options().container.phone
			: this.options().container.desktop
	);
	/** @internal */
	protected readonly variant = computed((): PrivacyChoicesPromptVariant =>
		resolvePrivacyChoicesVariant(this.#consent.snapshot().policyRule)
	);
	readonly #activeUI = computed(() => this.#consent.activeUI() ?? 'none');
	readonly #wantsShow = computed(
		() =>
			this.#consent.hasConsentUi() &&
			this.#activeUI() === 'banner' &&
			this.options().models.includes(this.#consent.model()) &&
			this.variant() !== 'none'
	);
	/** No motion to play: the exit is instant. */
	readonly #instant = computed(() => this.options().disableAnimation);

	/**
	 * Follows the kernel. Opening the dialog removes the prompt at once,
	 * even mid-exit (PERM-05); any other end plays the exit, unless there
	 * is no motion to play.
	 *
	 * @internal
	 */
	protected readonly phase = linkedSignal<
		{ wantsShow: boolean; activeUI: string; instant: boolean },
		Phase
	>({
		computation: (source, previous) => {
			const phase = previous?.value ?? (source.wantsShow ? 'shown' : 'hidden');
			if (source.wantsShow) {
				return 'shown';
			}
			if (phase === 'shown') {
				return source.activeUI === 'dialog' || source.instant
					? 'hidden'
					: 'leaving';
			}
			if (phase === 'leaving' && source.activeUI === 'dialog') {
				return 'hidden';
			}
			return phase;
		},
		source: () => ({
			activeUI: this.#activeUI(),
			instant: this.#instant(),
			wantsShow: this.#wantsShow(),
		}),
	});

	/** @internal */
	protected readonly allInOne = computed(
		() => this.layout().flow === 'all-in-one'
	);
	/** @internal */
	protected readonly expanded = computed(
		() => !this.allInOne() && this.#surface.state().expanded
	);
	/** @internal */
	protected readonly barCollapsed = computed(
		() => this.layout().type === 'banner' && !this.expanded()
	);
	/** @internal */
	protected readonly showing = computed(() => this.phase() !== 'hidden');
	readonly #blocking = computed(
		() => this.layout().blocking && this.phase() === 'shown'
	);
	/** @internal */
	protected readonly optionsOpen = computed(
		() => this.allInOne() || this.expanded()
	);
	readonly #panelWanted = signal(false);
	/** The options load with Customize, or at once in a side Drawer. @internal */
	protected readonly wantPanel = computed(
		() => this.#panelWanted() || this.optionsOpen()
	);
	/** Customize was hovered or focused, or the dialog warmed. @internal */
	protected readonly warmPanel = signal(false);
	/** @internal */
	protected readonly panelReady = signal(false);
	/** @internal */
	protected readonly notice = computed(() => this.variant() === 'notice');

	readonly #bundle = computed(() => rightsBundleOf(this.#consent.snapshot()));
	readonly #gpc = computed(
		() => resolveOptOutState(this.#consent.snapshot()).lock === 'gpc-active'
	);
	/** @internal */
	protected readonly copy = computed(() =>
		resolvePrivacyChoicesBannerCopy(this.translations(), {
			bundle: this.#bundle(),
			gpc: this.#gpc(),
			variant: this.variant(),
		})
	);
	/** @internal */
	protected readonly statusText = computed(() =>
		announcementText(this.#surface.state().announcement)
	);
	/** @internal */
	protected readonly links = computed(
		(): readonly NonNullable<LegalLinkSelection>[number][] => {
			const links = this.options().legalLinks;
			return (links === undefined ? CARD_LINKS : links) ?? [];
		}
	);
	/** @internal */
	protected readonly barLinks = computed(() =>
		this.links().filter((key) => key === 'privacyPolicy')
	);

	/** @internal */
	protected readonly showTag = computed(() => !this.options().hideBranding);
	readonly #hostname = signal<string | undefined>(undefined);
	/** @internal */
	protected readonly tag = computed(() =>
		this.showTag()
			? resolveBrandingTag({
					branding: this.#consent.branding(),
					hostname: this.#hostname(),
					noStyle: true,
					styles: {},
					surface: 'banner',
				})
			: null
	);

	/** @internal */
	protected readonly rootPart = computed(() =>
		slotPart(
			'consentBanner',
			this.#theme.theme(),
			this.#noStyle(),
			surfaceStyles.root,
			this.presentationStyles().root
		)
	);

	/** A choice was made here: release, announce and return focus as the prompt leaves. */
	#committed: string | null = null;
	#pendingPanelFocus = false;
	/** Folding the options returns focus to Customize once it renders again. */
	#pendingExpandFocus = false;
	#pageRegionController: LiveRegion | null = null;

	constructor() {
		// Before the first paint, and again when `noStyle` turns off.
		effect(() => {
			this.#styles.ensure(
				this.presentation().sheets,
				this.#noStyle(),
				SURFACE_SCOPES.banner
			);
		});
		afterNextRender(() => {
			this.#hostname.set(window.location.hostname);
			this.#pageRegionController = attachLiveRegion(
				this.pageRegion().nativeElement
			);
		});
		inject(DestroyRef).onDestroy(() => {
			this.#pageRegionController?.();
			this.#pageRegionController = null;
		});
		this.#followExit();
		this.#followCommit();
		this.#followBlocking();
		this.#followEscape();
		this.#followFocus();
		// The options load with Customize; warm them with the dialog's idle
		// warming while the prompt shows.
		effect((onCleanup) => {
			if (this.phase() !== 'shown' || this.allInOne()) {
				return;
			}
			onCleanup(
				registerDialogWarmer(() => {
					this.warmPanel.set(true);
				})
			);
		});
		// Scroll-edge fades (LAY-08) on whichever scroll area shows.
		afterRenderEffect((onCleanup) => {
			const area = this.scroll()?.nativeElement;
			if (!(area && this.optionsOpen() && this.panelReady())) {
				return;
			}
			const fades = attachScrollFades(area);
			onCleanup(() => fades());
		});
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	/** A part's class and style, with its theme slot. @internal */
	protected part(key: AllThemeKeys, ...base: (string | undefined)[]) {
		return slotPart(key, this.#theme.theme(), this.#noStyle(), ...base);
	}

	/** The exit plays out, then the prompt unmounts. */
	#followExit(): void {
		afterRenderEffect((onCleanup) => {
			if (this.phase() !== 'leaving') {
				return;
			}
			const root = this.root()?.nativeElement;
			if (!root) {
				untracked(() => this.phase.set('hidden'));
				return;
			}
			onCleanup(
				afterMotion(
					root.querySelector('*') ?? root,
					() => this.phase.set('hidden'),
					{
						duration: EXIT_MS,
						reducedMotion: untracked(this.#instant),
					}
				)
			);
		});
	}

	/**
	 * After a choice: the page is released, the outcome is announced in the
	 * page's status region, and focus moves to "Your Privacy Choices"
	 * (BNR-06). Not when the dialog took over.
	 */
	#followCommit(): void {
		afterRenderEffect(() => {
			const phase = this.phase();
			const activeUI = this.#activeUI();
			if (phase === 'shown' || this.#committed === null) {
				return;
			}
			const message = this.#committed;
			this.#committed = null;
			if (activeUI === 'dialog') {
				return;
			}
			if (message) {
				this.#pageRegionController?.announce(message);
			}
			const active = document.activeElement;
			const root = this.root()?.nativeElement;
			if (!active || active === document.body || root?.contains(active)) {
				focusReturnTarget();
			}
		});
	}

	/**
	 * Blocking (BNR-13): the shell, card and tag together, is the modal
	 * boundary (PERM-08). Focus moves to the card and stays in the shell.
	 */
	#followBlocking(): void {
		afterRenderEffect((onCleanup) => {
			const root = this.root()?.nativeElement;
			const shell = this.shell()?.nativeElement;
			if (!(this.#blocking() && root && shell)) {
				return;
			}
			const card = untracked(this.card)?.nativeElement;
			const release = attachPageBlock(root);
			const untrap = attachTopLayerTrap(shell, {
				initialFocus: card ?? 'first-tabbable',
			});
			onCleanup(() => {
				untrap();
				release();
			});
		});
	}

	/**
	 * Escape folds the options or closes a confirmation, never the prompt
	 * (PERM-03, PERM-15).
	 */
	#followEscape(): void {
		effect((onCleanup) => {
			if (this.phase() !== 'shown') {
				return;
			}
			const session = this.#surface.session();
			const { blocking } = this.layout();
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key !== 'Escape' || event.defaultPrevented) {
					return;
				}
				const shell = this.shell()?.nativeElement;
				const outcome = session.escape({
					blocking,
					focusInside: Boolean(shell?.contains(document.activeElement)),
				});
				if (outcome === 'ignore') {
					return;
				}
				event.preventDefault();
				if (outcome === 'collapse') {
					this.#pendingExpandFocus = true;
				}
			};
			document.addEventListener('keydown', onKeyDown);
			onCleanup(() => document.removeEventListener('keydown', onKeyDown));
		});
	}

	#followFocus(): void {
		// The first control of the options takes focus once they render. The
		// panel's own rules arrive with it, and its content becomes visible
		// as they apply; try again for a few frames until it can take focus.
		afterRenderEffect((onCleanup) => {
			if (!(this.expanded() && this.panelReady() && this.#pendingPanelFocus)) {
				return;
			}
			this.#pendingPanelFocus = false;
			let frames = 0;
			let handle = 0;
			const focusFirst = () => {
				const scroll = this.scroll()?.nativeElement;
				const first = scroll ? tabbableElements(scroll)[0] : undefined;
				first?.focus({ preventScroll: true });
				if (!first || document.activeElement !== first) {
					frames += 1;
					if (frames < 20) {
						handle = requestAnimationFrame(focusFirst);
					}
				}
			};
			focusFirst();
			onCleanup(() => cancelAnimationFrame(handle));
		});
		afterRenderEffect(() => {
			if (!this.expanded() && this.#pendingExpandFocus) {
				this.#pendingExpandFocus = false;
				this.card()
					?.nativeElement.querySelector<HTMLElement>(
						'[data-testid="consent-banner-customize-button"],[data-testid="consent-banner-right-link-opt-out"]'
					)
					?.focus({ preventScroll: true });
			}
		});
	}

	/** @internal */
	protected commit(action: BannerCommitAction): void {
		const { plan } = commitBannerChoice(this.#consent.kernel(), action, {
			draft: action === 'save' ? this.#draft.draft() : undefined,
			uiSource: 'banner',
		});
		const copy = this.copy();
		let message = copy.saved;
		if (action === 'refuse') {
			message = copy.rejected;
		} else if (plan.keptOff !== null) {
			message = resolveBannerAllowedAnnouncement(this.translations(), {
				bundle: this.#bundle(),
				gpc: plan.keptOff === 'gpc',
			});
		}
		this.#committed = message;
	}

	/** @internal */
	protected acknowledge(): void {
		this.#committed = '';
		this.#surface.session().commit();
		void this.#consent.dismissNotice();
	}

	/** @internal */
	protected expand(): void {
		this.warmPanel.set(true);
		this.#panelWanted.set(true);
		this.#pendingPanelFocus = true;
		const session = this.#surface.session();
		session.expand();
		session.announce(this.copy().expanded);
	}

	/** @internal */
	protected warm(): void {
		this.warmPanel.set(true);
		warmDialog();
	}
}
