import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import {
	ConsentManager,
	ConsentTheme,
	FocusTrap,
	Portal,
	ScrollLock,
	ɵBranding as Branding,
	ɵInitialFocus as InitialFocus,
	ɵNoStyleScope as NoStyleScope,
	ɵOverlay as Overlay,
	ɵresolveNoStyle as resolveNoStyle,
	ɵshouldShowBranding as shouldShowBranding,
} from '@inth/angular';
import {
	TabsContent,
	Tabs,
	TabsList,
	TabsTrigger,
	uniqueId,
} from '@inth/angular/primitives';
import { resolveIABBannerSummary } from '@inth/sdk/iab-support';
import {
	applyPublisherRestrictionsToGVL,
	resolveIABDialogDisplayModel,
} from '@inth/sdk/iab/headless';
import type { HeadlessIABVendorId } from '@inth/sdk/iab/headless';
import { saveIABConsentSurface } from '@inth/sdk/surface-actions';
import {
	resolveConsentPresentation,
	resolveIABCopy,
} from '@inth/sdk/surface-state';
import { isDialogDismissKey } from '@inth/sdk/ui/primitives/dialog';
import actionStyles from '@inth/sdk/ui/styles/components/consent-actions';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import { buttonVariants } from '@inth/sdk/ui/styles/primitives';
import {
	getTextDirection,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

import { IABFeatureItem } from './iab-feature-item';
import { ChevronRightIcon, CloseIcon, InfoIcon, LockIcon } from './iab-icons';
import { IABPurposeItem } from './iab-purpose-item';
import type { IABPurposeChoice, IABVendorChoice } from './iab-purpose-item';
import { IABStackItem } from './iab-stack-item';
import { IABVendorList } from './iab-vendor-list';
import type { IABAdTechProviderChoice } from './iab-vendor-list';

type IABBannerSummary = ReturnType<typeof resolveIABBannerSummary>;

const secondaryButtonClass = buttonVariants({
	mode: 'stroke',
	size: 'small',
	variant: 'neutral',
}).root();
const primaryButtonClass = buttonVariants({
	mode: 'filled',
	size: 'small',
	variant: 'primary',
}).root();

/**
 * The IAB preference centre itself, which `<inth-iab-consent-dialog>`
 * imports on demand so its code stays out of the first load.
 *
 * Plain elements, not the dialog primitive: React's IAB preference centre is
 * hand-rolled, and the primitive's `data-slot`/`data-state` bookkeeping is
 * exactly the kind of difference the cross-framework gate catches. Portal,
 * focus trap, scroll lock and Escape to close come from the same directives
 * the IAB banner uses.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [
		Branding,
		ChevronRightIcon,
		CloseIcon,
		FocusTrap,
		IABFeatureItem,
		IABPurposeItem,
		IABStackItem,
		IABVendorList,
		InfoIcon,
		InitialFocus,
		LockIcon,
		Overlay,
		Portal,
		ScrollLock,
		TabsContent,
		Tabs,
		TabsList,
		TabsTrigger,
	],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-iab-consent-dialog-body',
	template: `
		@if (open()) {
			@let iabT = translations();
			@let pc = iabT.preferenceCenter;
			@let state = iab();
			<div inthPortal>
				@if (preferences().blocking) {
					<div
						inth-overlay
						[styles]="styles"
						[variant]="'iab-dialog'"
						[entering]="!disableAnimation()"
						[visible]="true"
					></div>
				}
				<div
					[class]="rootStyle().className || ''"
					[attr.style]="toStyle(rootStyle().style)"
					data-testid="iab-consent-dialog-root"
					data-inth-surface="dialog"
					[attr.dir]="textDirection()"
				>
					<!-- A div, not a dialog: the user agent's dialog padding is
					     1em, which the card sets for itself. -->
					<div
						[class]="cardStyle().className || ''"
						[attr.style]="toStyle(cardStyle().style)"
						data-testid="iab-consent-dialog-card"
						role="dialog"
						[attr.aria-modal]="preferences().blocking ? 'true' : null"
						[attr.aria-label]="pc.title"
						[attr.aria-describedby]="descriptionId"
						tabindex="-1"
						inthInitialFocus
						[inthFocusTrap]="{
							enabled: preferences().blocking,
							initialFocus: 'first-tabbable',
						}"
						[inthScrollLock]="preferences().blocking"
						(keydown)="dismissOnEscape($event)"
					>
						<div
							[class]="headerStyle().className || ''"
							[attr.style]="toStyle(headerStyle().style)"
						>
							<div [class]="cls(styles.headerContent)">
								<h2 [class]="cls(styles.title)">{{ pc.title }}</h2>
								<p
									[class]="cls(styles.description)"
									[id]="descriptionId"
								>
									{{ pc.description }}
								</p>
							</div>
							<button
								type="button"
								[class]="cls(styles.closeButton)"
								[attr.aria-label]="coreTranslations().common.close"
								data-testid="iab-consent-dialog-close"
								(click)="close()"
							>
								<svg
									inth-close-icon
									style="height: 1rem; width: 1rem"
									aria-hidden="true"
								></svg>
							</button>
						</div>

						<div
							inthTabs
							[value]="activeTab()"
							(valueChange)="selectTab($event)"
							[class]="cls(styles.body)"
						>
							<div [class]="cls(styles.tabsContainer)">
								<div
									inthTabsList
									[class]="cls(styles.tabsList)"
								>
									<button
										inthTabsTrigger
										value="purposes"
										[class]="cls(styles.tabButton)"
									>
										{{ pc.tabs.purposes }}
										@if (!isLoading()) {
											({{ display().purposeTabCount }})
										}
									</button>
									<button
										inthTabsTrigger
										value="vendors"
										[class]="cls(styles.tabButton)"
									>
										{{ pc.tabs.vendors }}
										@if (!isLoading()) {
											({{ display().vendorTabCount }})
										}
									</button>
									<div
										aria-hidden="true"
										[class]="cls(styles.tabIndicator)"
										[attr.data-active-tab]="activeTab()"
									></div>
								</div>
							</div>

							<div [class]="cls(styles.content)">
								<div
									inthTabsContent
									value="purposes"
									[class]="cls(styles.tabPanel)"
								>
									@if (isLoading()) {
										<div [class]="cls(styles.loadingContainer)">
											<div [class]="cls(styles.loadingSpinner)"></div>
											<p [class]="cls(styles.loadingText)">
												{{ iabT.common.loading }}
											</p>
										</div>
									} @else if (display().isReady && state) {
										@for (row of display().consentRows; track row.testId) {
											@if (row.kind === 'stack') {
												<inth-iab-stack-item
													[stack]="row"
													[consents]="state.purposeConsents"
													[vendorConsents]="state.vendorConsents"
													[legitimateInterests]="state"
													[purposeObjection]="true"
													[vendorObjection]="true"
													[noStyle]="resolvedNoStyle()"
													[iabT]="iabT"
													(purposeToggle)="setPurposeConsent($event)"
													(vendorToggle)="setVendorConsent($event)"
													(vendorClick)="showVendor($event)"
													(vendorLegitimateInterestToggle)="
														setVendorLegitimateInterest($event)
													"
													(purposeLegitimateInterestToggle)="
														setPurposeObjection($event)
													"
												/>
											} @else if (row.toggle === 'special-feature') {
												<inth-iab-purpose-item
													[purpose]="row"
													[testId]="row.testId"
													[isEnabled]="
														state.specialFeatureOptIns[row.id] ?? false
													"
													[vendorConsents]="state.vendorConsents"
													[legitimateInterests]="state"
													[vendorObjection]="true"
													[noStyle]="resolvedNoStyle()"
													[iabT]="iabT"
													(purposeToggle)="
														setSpecialFeatureOptIn(row.id, $event)
													"
													(vendorToggle)="setVendorConsent($event)"
													(vendorClick)="showVendor($event)"
													(vendorLegitimateInterestToggle)="
														setVendorLegitimateInterest($event)
													"
												/>
											} @else {
												<inth-iab-purpose-item
													[purpose]="row"
													[testId]="row.testId"
													[isEnabled]="state.purposeConsents[row.id] ?? false"
													[vendorConsents]="state.vendorConsents"
													[legitimateInterests]="state"
													[purposeObjection]="true"
													[vendorObjection]="true"
													[noStyle]="resolvedNoStyle()"
													[iabT]="iabT"
													(purposeToggle)="
														setPurposeConsent({
															purposeId: row.id,
															value: $event,
														})
													"
													(vendorToggle)="setVendorConsent($event)"
													(vendorClick)="showVendor($event)"
													(vendorLegitimateInterestToggle)="
														setVendorLegitimateInterest($event)
													"
													(purposeLegitimateInterestToggle)="
														setPurposeObjection($event)
													"
												/>
											}
										}

										@if (display().essentialRows.length > 0) {
											<div [class]="cls(styles.specialPurposesSection)">
												<div [class]="cls(styles.specialPurposesHeader)">
													<button
														type="button"
														[attr.aria-expanded]="specialPurposesExpanded()"
														[class]="cls(styles.purposeTrigger)"
														(click)="toggleSpecialPurposes()"
													>
														<svg
															inth-chevron-right-icon
															[class]="cls(styles.purposeArrow)"
															aria-hidden="true"
															[expanded]="specialPurposesExpanded()"
														></svg>
														<div [class]="cls(styles.purposeInfo)">
															<h3 [class]="cls(styles.specialPurposesTitle)">
																{{ pc.specialPurposes.title }}
																<svg
																	inth-lock-icon
																	[class]="cls(styles.lockIcon)"
																	aria-hidden="true"
																></svg>
															</h3>
															<p [class]="cls(styles.purposeMeta)">
																{{ display().essentialPartnerCount }}
																{{
																	display().essentialPartnerCount === 1
																		? pc.vendorList.partnerSingular
																		: pc.vendorList.partnerPlural
																}}
															</p>
														</div>
													</button>
													<div style="position: relative">
														<svg
															inth-info-icon
															[class]="cls(styles.infoIcon)"
															[attr.aria-label]="pc.specialPurposes.tooltip"
														></svg>
													</div>
												</div>

												@if (specialPurposesExpanded()) {
													<div style="padding: 0.75rem">
														@for (
															row of display().essentialRows;
															track row.testId
														) {
															<inth-iab-purpose-item
																[purpose]="row"
																[testId]="row.testId"
																[isEnabled]="true"
																[isLocked]="true"
																[vendorConsents]="state.vendorConsents"
																[noStyle]="resolvedNoStyle()"
																[iabT]="iabT"
																(vendorToggle)="setVendorConsent($event)"
																(vendorClick)="showVendor($event)"
															/>
														}
													</div>
												}
											</div>
										}

										<!-- Features: informational, no controls (TCF Policies v5.0.b) -->
										@if (display().featureRows.length > 0) {
											<section
												[attr.aria-label]="pc.features.title"
												[class]="cls(styles.featuresSection)"
												data-testid="iab-consent-dialog-features"
											>
												<div [class]="cls(styles.featuresHeader)">
													<h3 [class]="cls(styles.featuresTitle)">
														{{ pc.features.title }}
													</h3>
													<p [class]="cls(styles.featuresDescription)">
														{{
															display().featuresStandardText ??
																pc.features.description
														}}
													</p>
												</div>
												<div [class]="cls(styles.featuresList)">
													@for (
														row of display().featureRows;
														track row.testId
													) {
														<inth-iab-feature-item
															[feature]="row"
															[testId]="row.testId"
															[noStyle]="resolvedNoStyle()"
															[iabT]="iabT"
														/>
													}
												</div>
											</section>
										}

										<div [class]="cls(styles.consentNotice)">
											<p [class]="cls(styles.consentNoticeText)">
												{{ pc.footer.consentStorage }}
											</p>
										</div>
									}
								</div>

								<div
									inthTabsContent
									value="vendors"
									[class]="cls(styles.tabPanel)"
								>
									@if (state && vendorsVisited()) {
										<inth-iab-vendor-list
											[vendorData]="vendorData()"
											[purposes]="display().data.purposes"
											[vendorConsents]="state.vendorConsents"
											[selectedVendorId]="selectedVendorId()"
											[customVendors]="state.nonIABVendors"
											[legitimateInterests]="state"
											[vendorObjection]="true"
											[adTechProviders]="state.adTechProviders ?? []"
											[adTechProviderConsents]="
												state.adTechProviderConsents ?? {}
											"
											[noStyle]="resolvedNoStyle()"
											[iabT]="iabT"
											[language]="language()"
											(vendorToggle)="setVendorConsent($event)"
											(vendorLegitimateInterestToggle)="
												setVendorLegitimateInterest($event)
											"
											(adTechProviderToggle)="setAdTechProviderConsent($event)"
											(clearSelection)="selectedVendorId.set(null)"
										/>
									}
								</div>
							</div>
						</div>

						<div
							[class]="footerStyle().className || ''"
							[attr.style]="toStyle(footerStyle().style)"
							data-direction="row"
							data-split=""
						>
							<div
								[class]="cls(actionStyles.actionGroup)"
								data-direction="row"
							>
								<button
									type="button"
									[class]="cls(secondaryButtonClass)"
									(click)="rejectAll()"
									[disabled]="!summary().isReady"
									data-action="reject"
								>
									{{ iabT.common.rejectAll }}
								</button>
								<button
									type="button"
									[class]="cls(secondaryButtonClass)"
									(click)="acceptAll()"
									[disabled]="!summary().isReady"
									data-action="accept"
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
									[class]="cls(primaryButtonClass)"
									(click)="save()"
									[disabled]="isLoading()"
									data-action="customize"
								>
									{{ iabT.common.saveSettings }}
								</button>
							</div>
						</div>
						@if (showBranding()) {
							<a
								inth-branding
								[noStyle]="resolvedNoStyle()"
								surface="iab-dialog"
							></a>
						}
					</div>
				</div>
			</div>
		}
	`,
})
export class IABConsentDialogBody {
	/** Id of this dialog's description, unique on the page. */
	protected readonly descriptionId = uniqueId('iab-consent-dialog-description');
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/** Whether the dialog shows. */
	readonly open = input(false);
	/** Emits `false` when the visitor asks to close: Escape or the close button. */
	readonly openChange = output<boolean>();
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Skip the backdrop's fade-in. */
	readonly disableAnimation = input(false);
	/** Hide the "Consent by" attribution. */
	readonly hideBranding = input(false);
	/** The tab the dialog opens on. */
	readonly initialTab = input<'purposes' | 'vendors' | undefined>(undefined);
	/** Extra class for the card. */
	readonly rootClass = input<string | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly actionStyles = actionStyles;
	/** @internal */
	protected readonly secondaryButtonClass = secondaryButtonClass;
	/** @internal */
	protected readonly primaryButtonClass = primaryButtonClass;

	/** @internal */
	protected readonly iab = this.#consent.iab;
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly translations = computed(() =>
		resolveIABCopy(this.#consent.copy())
	);
	/** @internal */
	protected readonly coreTranslations = this.#consent.copy;
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.#consent.translations()?.language)
	);
	/** @internal */
	protected readonly language = computed(
		() => this.#consent.translations()?.language
	);
	/** @internal */
	protected readonly showBranding = computed(() =>
		shouldShowBranding(this.#consent.branding(), this.hideBranding())
	);

	/** @internal */
	protected readonly preferences = computed(() =>
		resolveConsentPresentation({
			policy: this.#consent.snapshot().policyRule,
			presentation: {
				preferences: {
					scrollLock: this.#theme.scrollLock(),
					trapFocus: this.#theme.trapFocus(),
					...this.#consent.presentation()?.preferences,
				},
			},
			surface: 'preferences',
		})
	);

	/** @internal */
	protected readonly rootStyle = computed(() =>
		resolveStyles(
			'iabConsentDialog',
			this.#theme.theme(),
			{
				baseClassName: [styles.root, styles.dialogVisible],
				noStyle: this.resolvedNoStyle(),
			},
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly cardStyle = computed(() =>
		resolveStyles(
			'iabConsentDialogCard',
			this.#theme.theme(),
			{
				baseClassName: [styles.card, styles.contentVisible],
				className: this.rootClass(),
				noStyle: this.resolvedNoStyle(),
			},
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly headerStyle = computed(() =>
		resolveStyles(
			'iabConsentDialogHeader',
			this.#theme.theme(),
			{ baseClassName: styles.header, noStyle: this.resolvedNoStyle() },
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly footerStyle = computed(() =>
		resolveStyles(
			'iabConsentDialogFooter',
			this.#theme.theme(),
			{
				baseClassName: [styles.footer, actionStyles.actionRoot],
				noStyle: this.resolvedNoStyle(),
			},
			this.resolvedNoStyle()
		)
	);

	/** @internal */
	protected readonly activeTab = signal<string | null>('purposes');
	readonly #rememberedTab = computed(() => this.iab()?.preferenceCenterTab);
	/** @internal */
	protected readonly selectedVendorId = signal<HeadlessIABVendorId | null>(
		null
	);
	/** @internal */
	protected readonly specialPurposesExpanded = signal(false);
	/**
	 * The vendor list renders from the first time its tab shows, so opening
	 * the dialog does not build a row per vendor of a full GVL up front.
	 *
	 * @internal
	 */
	protected readonly vendorsVisited = computed(() => {
		if (this.activeTab() === 'vendors') {
			this.#vendorsVisited = true;
		}
		return this.#vendorsVisited;
	});
	#vendorsVisited = false;

	/** The rows this surface renders, from the shared display model. @internal */
	protected readonly display = computed(() => {
		const state = this.iab();
		return resolveIABDialogDisplayModel(
			state
				? {
						adTechProviders: state.adTechProviders,
						customVendors: state.nonIABVendors ?? [],
						gvl: state.gvl,
						isLoadingGVL: state.isLoadingGVL,
						publisherRestrictions: state.publisherRestrictions,
					}
				: null
		);
	});
	/**
	 * The vendor tab reads declarations directly, so give it the ones
	 * publisher restrictions leave.
	 *
	 * @internal
	 */
	protected readonly vendorData = computed(() => {
		const state = this.iab();
		return state?.gvl
			? applyPublisherRestrictionsToGVL(state.gvl, state.publisherRestrictions)
			: null;
	});
	/** @internal */
	protected readonly summary: Signal<IABBannerSummary> = computed(() =>
		resolveIABBannerSummary(this.iab())
	);
	/** @internal */
	protected readonly isLoading = computed(() => {
		const state = this.iab();
		return Boolean(state?.isLoadingGVL || !state?.gvl);
	});

	constructor() {
		// A caller-supplied `initialTab` outranks the provider's remembered
		// tab, which is what makes a "N partners" link land on the vendor
		// list. The effect reads the remembered tab as a value, so only a tab
		// change reruns it, never another IAB update.
		effect(() => {
			const initial = this.initialTab();
			if (initial) {
				this.selectTab(initial);
				return;
			}
			const remembered = this.#rememberedTab();
			if (this.open() && remembered) {
				this.activeTab.set(remembered);
			}
		});
	}

	/**
	 * Show a tab and remember it on the provider, so a reopened dialog
	 * opens on it.
	 *
	 * @internal
	 */
	protected selectTab(tab: string | null): void {
		this.activeTab.set(tab);
		if (tab === 'purposes' || tab === 'vendors') {
			untracked(() => this.iab()?.setPreferenceCenterTab(tab));
		}
	}

	/** @internal */
	protected toStyle(style: Parameters<typeof toStyleAttributeValue>[0]) {
		return toStyleAttributeValue(style) ?? null;
	}

	/** @internal */
	protected cls(name: string | undefined): string {
		return this.resolvedNoStyle() ? '' : name || '';
	}

	/** @internal */
	protected close(): void {
		this.openChange.emit(false);
		this.#consent.setActiveUI('none');
	}

	/** @internal */
	protected dismissOnEscape(event: KeyboardEvent): void {
		if (isDialogDismissKey(event.key)) {
			event.preventDefault();
			this.close();
		}
	}

	/** @internal */
	protected toggleSpecialPurposes(): void {
		this.specialPurposesExpanded.update((open) => !open);
	}

	/** @internal */
	protected setPurposeConsent({ purposeId, value }: IABPurposeChoice): void {
		this.iab()?.setPurposeConsent(purposeId, value);
	}

	/** @internal */
	protected setSpecialFeatureOptIn(featureId: number, value: boolean): void {
		this.iab()?.setSpecialFeatureOptIn(featureId, value);
	}

	/** @internal */
	protected setVendorConsent({ vendorId, value }: IABVendorChoice): void {
		this.iab()?.setVendorConsent(vendorId, value);
	}

	/** @internal */
	protected setAdTechProviderConsent({
		providerId,
		value,
	}: IABAdTechProviderChoice): void {
		this.iab()?.setAdTechProviderConsent(providerId, value);
	}

	/** @internal */
	protected setVendorLegitimateInterest({
		vendorId,
		value,
	}: IABVendorChoice): void {
		this.iab()?.setVendorLegitimateInterest(vendorId, value);
	}

	/** @internal */
	protected setPurposeObjection({ purposeId, value }: IABPurposeChoice): void {
		this.iab()?.setPurposeObjection(purposeId, !value);
	}

	/** @internal */
	protected showVendor(vendorId: HeadlessIABVendorId): void {
		this.selectedVendorId.set(vendorId);
		this.selectTab('vendors');
	}

	/** @internal */
	protected async save(): Promise<void> {
		const state = this.iab();
		if (!state) {
			return;
		}
		const kernel = this.#consent.kernel();
		await saveIABConsentSurface(kernel, () => state.save());
		// The save closed the surface: a parent that owns `open` hears it.
		// A save that recorded nothing brings the dialog back instead.
		if (kernel.getSnapshot().activeUI !== 'dialog') {
			this.openChange.emit(false);
		}
	}

	/** @internal */
	protected async acceptAll(): Promise<void> {
		this.iab()?.acceptAll();
		await this.save();
	}

	/** @internal */
	protected async rejectAll(): Promise<void> {
		this.iab()?.rejectAll();
		await this.save();
	}
}
