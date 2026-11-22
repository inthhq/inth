import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
} from '@angular/core';
import {
	ConsentButton,
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	SURFACE_SCOPES,
	ɵBranding as Branding,
	ɵNoStyleScope as NoStyleScope,
	ɵOptInConfirmation as OptInConfirmation,
	ɵPolicyActions as PolicyActions,
	ɵresolveNoStyle as resolveNoStyle,
	ɵshouldShowBranding as shouldShowBranding,
} from '@inth/angular';
import {
	PreferenceItemContent,
	PreferenceItemControl,
	PreferenceItem,
	PreferenceItemHeader,
	PreferenceItemLeading,
	PreferenceItemTitle,
	PreferenceItemTrigger,
	SwitchControl,
	Switch,
	SwitchThumb,
	uniqueId,
} from '@inth/angular/primitives';
import type {
	AllConsentNames,
	ConsentType,
	SaveUISource,
} from '@inth/sdk/engine';
import { actionAppearanceFromTheme } from '@inth/sdk/engine';
import { createPreferenceDraft } from '@inth/sdk/preference-draft';
import { optInConsentSurface } from '@inth/sdk/surface-actions';
import {
	resolveCategoryOptOutLock,
	resolveCategoryTitle,
	resolveConsentPresentation,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutReceiptSentence,
} from '@inth/sdk/surface-state';
import accordionStyles from '@inth/sdk/ui/styles/components/accordion';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import managerStyles from '@inth/sdk/ui/styles/components/consent-manager';
import optOutConfirmationStyles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import switchStyles from '@inth/sdk/ui/styles/components/switch';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { ConsentActionKey } from '@inth/sdk/ui/theme';
import {
	getTextDirection,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

import { ConsentVendorList } from './consent-vendor-list';
import { DIALOG_SHEETS } from './dialog-sheets';

type ChoiceCategory = Exclude<AllConsentNames, 'necessary'>;

const formatRecordedAt = function formatRecordedAt(
	at: number,
	language: string
): string {
	try {
		return new Intl.DateTimeFormat(language, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	} catch {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	}
};

/**
 * The widget's root element and everything in it. The host is the root
 * `<div>`, so the consent dialog can place it directly in its content
 * area: the dialog's stylesheet lays the widget out with child selectors
 * (`.content > [data-testid='consent-widget-root']`), which a component
 * host element in between would break.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.dir]': 'textDirection()',
		'[attr.style]': 'styleOf(rootStyle())',
		'[class]': "rootStyle().className || ''",
	},
	imports: [
		Branding,
		ConsentButton,
		ConsentVendorList,
		PolicyActions,
		PreferenceItemContent,
		PreferenceItemControl,
		PreferenceItem,
		PreferenceItemHeader,
		PreferenceItemLeading,
		PreferenceItemTitle,
		PreferenceItemTrigger,
		SwitchControl,
		Switch,
		SwitchThumb,
	],
	// Matching the root's own test id leaves no selector attribute in the
	// page: the root renders exactly as the other adapters' does.
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'div[data-testid="consent-widget-root"]',
	template: `@if (consent.draft.isStale()) {
			<div role="alert">
				The policy changed. Review your preferences before saving.
				<button
					type="button"
					(click)="consent.draft.reset()"
				>
					Review preferences
				</button>
			</div>
		}
		@if (optOutState().available) {
			<section
				[attr.aria-labelledby]="optOutHeadingId"
				[class]="optOutBlockStyle().className || ''"
				[attr.style]="styleOf(optOutBlockStyle())"
				data-testid="consent-widget-opt-out"
			>
				<h3
					[id]="optOutHeadingId"
					[class]="resolvedNoStyle() ? '' : manager.optOutHeading || ''"
					data-testid="consent-widget-opt-out-heading"
				>
					{{ optOutBlockHeading() }}
				</h3>
				@if (optOutState().honored) {
					<p
						[class]="optOutStatusStyle().className || ''"
						[attr.style]="styleOf(optOutStatusStyle())"
						role="status"
						data-testid="consent-widget-opt-out-status"
					>
						{{ optOutStatusText() }}
					</p>
					<p
						[class]="
							resolvedNoStyle() ? '' : optOutConfirmation.description || ''
						"
						data-testid="consent-widget-opt-out-description"
					>
						{{ receiptSentence() }}
					</p>
					@if (hasReceiptDetails()) {
						<dl
							[class]="
								resolvedNoStyle() ? '' : optOutConfirmation.receipt || ''
							"
							data-testid="consent-widget-opt-out-receipt"
						>
							@if (recordedAt(); as recorded) {
								<div
									[class]="
										resolvedNoStyle() ? '' : optOutConfirmation.receiptRow || ''
									"
								>
									<dt
										[class]="
											resolvedNoStyle()
												? ''
												: optOutConfirmation.receiptLabel || ''
										"
									>
										{{ optOutCopy().recordedLabel }}
									</dt>
									<dd
										[class]="
											resolvedNoStyle()
												? ''
												: optOutConfirmation.receiptValue || ''
										"
									>
										<time
											[attr.datetime]="recorded.iso"
											data-testid="consent-widget-opt-out-recorded-at"
										>
											{{ recorded.formatted }}
										</time>
									</dd>
								</div>
							}
							@if (optOutState().reference; as reference) {
								<div
									[class]="
										resolvedNoStyle() ? '' : optOutConfirmation.receiptRow || ''
									"
								>
									<dt
										[class]="
											resolvedNoStyle()
												? ''
												: optOutConfirmation.receiptLabel || ''
										"
									>
										{{ optOutCopy().referenceLabel }}
									</dt>
									<dd
										[class]="
											resolvedNoStyle()
												? ''
												: optOutConfirmation.receiptValue || ''
										"
									>
										<code
											[class]="
												resolvedNoStyle()
													? ''
													: optOutConfirmation.reference || ''
											"
											data-testid="consent-widget-opt-out-reference"
										>
											{{ reference }}
										</code>
									</dd>
								</div>
							}
						</dl>
					}
					@if (optOutState().lock !== 'gpc-active') {
						<button
							type="button"
							[class]="resolvedNoStyle() ? '' : manager.optInLink || ''"
							data-testid="consent-widget-opt-in-link"
							(click)="requestOptIn()"
						>
							{{ optOutCopy().optInLink }}
						</button>
					}
				} @else {
					<p
						[class]="resolvedNoStyle() ? '' : manager.optOutDescription || ''"
						data-testid="consent-widget-opt-out-description"
					>
						{{ optOutCopy().notOptedOut }}
					</p>
					<div [class]="resolvedNoStyle() ? '' : manager.optOutActions || ''">
						<button
							type="button"
							[attr.data-mode]="resolvedNoStyle() ? null : 'filled'"
							[attr.data-size]="resolvedNoStyle() ? null : 'small'"
							[attr.data-variant]="resolvedNoStyle() ? null : 'primary'"
							[class]="optOutButtonStyle().className || ''"
							[attr.style]="styleOf(optOutButtonStyle())"
							data-testid="consent-widget-opt-out-button"
							(click)="requestOptOut()"
						>
							{{ optOutCopy().action }}
						</button>
					</div>
				}
			</section>
		} @else if (optOutState().honored) {
			<p
				[class]="optOutStatusStyle().className || ''"
				[attr.style]="styleOf(optOutStatusStyle())"
				role="status"
				data-testid="consent-widget-opt-out-status"
			>
				{{ optOutStatusText() }}
			</p>
		}
		<div
			[class]="accordionStyle().className || ''"
			[attr.style]="styleOf(accordionStyle())"
			data-testid="consent-widget-accordion"
		>
			@for (consentType of displayedConsents(); track consentType.name) {
				@let name = consentType.name;
				@let isOpen = openItems()[name] ?? false;
				@let checked = isChecked(name);
				@let gpcLocked = isGpcLocked(name);
				@let reason = restrictionReason(name);
				@let title = titleOf(consentType);
				<div
					inthPreferenceItem
					[class]="resolvedNoStyle() ? '' : accordion.item || ''"
					[open]="isOpen"
					[noStyle]="true"
					[attr.data-testid]="'consent-widget-accordion-item-' + name"
				>
					<div [class]="resolvedNoStyle() ? '' : accordion.triggerRow || ''">
						<button
							inthPreferenceItemTrigger
							[class]="resolvedNoStyle() ? '' : accordion.trigger || ''"
							(click)="toggleOpenItem(name)"
							[attr.data-testid]="'consent-widget-accordion-trigger-' + name"
						>
							<div
								inthPreferenceItemLeading
								[class]="resolvedNoStyle() ? '' : accordion.arrow || ''"
								[attr.data-testid]="'consent-widget-accordion-arrow-' + name"
							>
								<!-- Decorative: the trigger's name is the category title
								     and aria-expanded carries the state. -->
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									@if (isOpen) {
										<path d="M5 12h14" />
									} @else {
										<path d="M5 12h14M12 5v14" />
									}
								</svg>
							</div>
							<div inthPreferenceItemHeader>
								<h3
									inthPreferenceItemTitle
									[class]="resolvedNoStyle() ? '' : accordion.title || ''"
								>
									{{ title }}
								</h3>
							</div>
						</button>

						<div
							inthPreferenceItemControl
							[class]="resolvedNoStyle() ? '' : accordion.control || ''"
						>
							<button
								inthSwitch
								[attr.aria-label]="title"
								[checked]="checked"
								(checkedChange)="toggleConsent(name, $event)"
								[attr.aria-describedby]="reason ? restrictionId(name) : null"
								[disabled]="isDisabled(consentType)"
								[class]="toggleStyle().className || ''"
								[attr.style]="styleOf(toggleStyle())"
								[attr.data-size]="resolvedNoStyle() ? null : 'small'"
								[attr.data-testid]="'consent-widget-switch-' + name"
							>
								<span
									inthSwitchControl
									[class]="resolvedNoStyle() ? '' : switches.track"
								>
									<span
										inthSwitchThumb
										[class]="resolvedNoStyle() ? '' : switches.thumb"
									></span>
								</span>
							</button>
						</div>
					</div>

					@if (reason) {
						<output
							[id]="restrictionId(name)"
							[class]="resolvedNoStyle() ? '' : accordion.restriction || ''"
							[attr.data-testid]="'consent-widget-restriction-' + name"
						>
							{{ reason }}
						</output>
					}
					<div
						inth-preference-item-content
						[viewportClassName]="
							resolvedNoStyle() ? undefined : accordion.contentViewport
						"
						[innerClassName]="
							resolvedNoStyle() ? undefined : accordion.contentInner
						"
						[class]="resolvedNoStyle() ? '' : accordion.content || ''"
						[attr.data-testid]="'consent-widget-accordion-content-' + name"
					>
						{{ descriptionOf(consentType) }}
						@if (hasVendors(name)) {
							<section
								inth-consent-vendor-list
								[category]="name"
								[hideHint]="gpcLocked"
								[noStyle]="resolvedNoStyle()"
							></section>
						}
					</div>
				</div>
			}
		</div>

		<div
			inth-policy-actions
			[actionGroups]="presentation().actionGroups"
			[primaryActions]="presentation().primaryActions"
			[shouldFillActions]="presentation().shouldFillActions"
			[direction]="presentation().direction"
			[noStyle]="resolvedNoStyle()"
			[footerClassName]="footerStyle().className || ''"
			[footerStyle]="styleOf(footerStyle()) ?? undefined"
			[groupClassName]="footerGroupStyle().className || ''"
			[groupStyle]="styleOf(footerGroupStyle()) ?? undefined"
			[footerTestId]="'consent-widget-footer'"
			[groupTestId]="'consent-widget-footer-sub-group'"
			[action]="actionButton"
		></div>
		<ng-template
			#actionButton
			let-action
			let-primary="primary"
		>
			@switch (action) {
				@case ('reject') {
					<button
						inth-consent-button
						[action]="'reject'"
						[variant]="appearance('reject', primary).variant"
						[mode]="appearance('reject', primary).mode"
						data-action="reject"
						data-testid="consent-widget-reject-button"
					>
						{{ translations().common.rejectAll }}
					</button>
				}
				@case ('accept') {
					<button
						inth-consent-button
						[action]="'accept'"
						[variant]="appearance('accept', primary).variant"
						[mode]="appearance('accept', primary).mode"
						data-action="accept"
						data-testid="consent-widget-footer-accept-all-button"
					>
						{{ translations().common.acceptAll }}
					</button>
				}
				@case ('save') {
					<button
						inth-consent-button
						[action]="'save'"
						[disabled]="consent.draft.isStale()"
						[variant]="appearance('save', primary).variant"
						[mode]="appearance('save', primary).mode"
						data-action="save"
						data-testid="consent-widget-footer-save-button"
					>
						{{ translations().common.save }}
					</button>
				}
			}
		</ng-template>

		@if (showBranding()) {
			<a
				inth-branding
				[noStyle]="resolvedNoStyle()"
				surface="widget"
			></a>
		}`,
})
export class ConsentWidgetRoot {
	/** @internal */
	protected readonly consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);
	readonly #id = uniqueId('inth-consent-widget');

	/** Hide the "Secured by" attribution. */
	readonly hideBranding = input(true);
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Extra class for the widget's root element. */
	readonly rootClass = input<string | undefined>(undefined);
	/** Source identifier recorded with opt-out and opt-in actions. */
	readonly uiSource = input<SaveUISource>('widget');

	/** @internal */
	protected readonly accordion = accordionStyles;
	/** @internal */
	protected readonly manager = managerStyles;
	/** @internal */
	protected readonly optOutConfirmation = optOutConfirmationStyles;
	/** @internal */
	protected readonly switches = switchStyles;
	/** @internal */
	protected readonly optOutHeadingId = `${this.#id}-opt-out-heading`;

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly translations = this.consent.copy;
	/** @internal */
	protected readonly optOutState = this.consent.optOutState;
	/** @internal */
	protected readonly language = computed(
		() => this.consent.translations()?.language ?? 'en'
	);
	/** @internal */
	protected readonly optOutCopy = computed(() =>
		resolveOptOutCopy(this.translations())
	);
	/** @internal */
	protected readonly optOutStatusText = computed(() =>
		this.optOutState().via === 'signal'
			? this.optOutCopy().statusSignal
			: this.optOutCopy().statusRequest
	);
	/** @internal */
	protected readonly optOutBlockHeading = computed(() =>
		resolveOptOutBlockHeading(
			this.translations(),
			this.optOutState(),
			this.consent.presentation()?.optOutLink
		)
	);
	/** @internal */
	protected readonly receiptSentence = computed(() =>
		resolveOptOutReceiptSentence(this.translations(), this.optOutState())
	);
	/** @internal */
	protected readonly hasReceiptDetails = computed(() => {
		const receipt = this.optOutState();
		return receipt.at !== null || receipt.reference !== null;
	});
	/** @internal */
	protected readonly recordedAt = computed(() => {
		const { at } = this.optOutState();
		if (at === null) {
			return null;
		}
		return {
			formatted: formatRecordedAt(at, this.language()),
			iso: new Date(at).toISOString(),
		};
	});
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.consent.translations()?.language)
	);

	/** @internal */
	protected readonly displayedConsents = computed(() => {
		const categories = this.consent.consentCategories();
		return this.consent
			.consentTypes()
			.filter((type) => categories.includes(type.name));
	});

	/** @internal */
	protected readonly openItems = signal<Readonly<Record<string, boolean>>>({});

	/** @internal */
	protected readonly rootStyle = computed(() =>
		resolveStyles(
			'consentWidget',
			this.#theme.theme(),
			{
				baseClassName: managerStyles.manager,
				className: this.rootClass(),
			},
			this.resolvedNoStyle()
		)
	);
	/** @internal */
	protected readonly optOutBlockStyle = computed(() =>
		this.#slot('consentWidgetOptOut', managerStyles.optOut)
	);
	/** @internal */
	protected readonly optOutButtonStyle = computed(() =>
		this.#slot('buttonPrimary', buttonStyles.button)
	);
	/** @internal */
	protected readonly optOutStatusStyle = computed(() =>
		this.#slot('consentWidgetOptOutStatus', managerStyles.optOutStatus)
	);
	/** @internal */
	protected readonly footerStyle = computed(() =>
		this.#slot('consentWidgetFooter', managerStyles.footer)
	);
	/** @internal */
	protected readonly accordionStyle = computed(() =>
		this.#slot('consentWidgetAccordion', accordionStyles.list)
	);
	/** @internal */
	protected readonly toggleStyle = computed(() =>
		this.#slot('toggle', switchStyles.root)
	);
	/** @internal */
	protected readonly footerGroupStyle = computed(() =>
		this.#slot('consentWidgetFooterSubGroup', undefined)
	);

	/** @internal */
	protected appearance(action: ConsentActionKey, primary: boolean) {
		return resolveActionAppearance(this.#theme.theme(), action, primary);
	}
	/** @internal */
	protected readonly presentation = computed(() =>
		resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(this.#theme.theme()),
			policy: this.consent.snapshot().policyRule,
			presentation: this.consent.presentation(),
			surface: 'preferences',
		})
	);
	/** @internal */
	protected readonly showBranding = computed(() =>
		shouldShowBranding(this.consent.branding(), this.hideBranding())
	);

	constructor() {
		// The draft ships with this widget, not with the provider. Handing it
		// over here seeds the switches in this render, server-side too.
		this.consent.provideDraft(createPreferenceDraft);
		// Again when `noStyle` turns off.
		effect(() => {
			this.#styles.ensure(
				DIALOG_SHEETS,
				this.resolvedNoStyle(),
				SURFACE_SCOPES.dialog
			);
		});
	}

	/** @internal */
	protected styleOf(style: { style?: unknown }): string | null {
		return (
			toStyleAttributeValue(
				style.style as Parameters<typeof toStyleAttributeValue>[0]
			) ?? null
		);
	}

	/** @internal */
	protected titleOf(type: ConsentType): string {
		return resolveCategoryTitle(this.translations(), type.name);
	}

	/** @internal */
	protected descriptionOf(type: ConsentType): string {
		return (
			this.translations().consentTypes[type.name]?.description ??
			type.description ??
			''
		);
	}

	/** @internal */
	protected isChecked(name: AllConsentNames): boolean {
		return (
			this.consent.selectedConsents()[name] ??
			this.consent.explicitChoice()?.categories[name as ChoiceCategory]
				?.value ??
			false
		);
	}

	/** @internal */
	protected isGpcLocked(name: AllConsentNames): boolean {
		return (
			resolveCategoryOptOutLock(this.consent.snapshot(), name) === 'gpc-active'
		);
	}

	/** @internal */
	protected isDisabled(type: ConsentType): boolean {
		return (
			type.name === 'necessary' ||
			(type.disabled ?? false) ||
			this.isGpcLocked(type.name)
		);
	}

	/** @internal */
	protected restrictionReason(name: AllConsentNames): string | null {
		if (name === 'necessary') {
			return null;
		}
		const lock = resolveCategoryOptOutLock(this.consent.snapshot(), name);
		if (lock === 'gpc-active') {
			return this.optOutCopy().lockedByGpc;
		}
		if (lock === 'held-by-account') {
			return this.optOutCopy().lockedByAccount;
		}
		const category = name as ChoiceCategory;
		const reasons = this.consent.restrictions()[category];
		if (
			this.consent.explicitChoice()?.categories[category]?.value === true &&
			reasons?.some((reason) => reason !== 'opt-out')
		) {
			return 'Your saved choice is restricted by the current privacy settings.';
		}
		return null;
	}

	/** @internal */
	protected restrictionId(name: AllConsentNames): string {
		return `${this.#id}-${name}-restriction`;
	}

	/** @internal */
	protected hasVendors(name: AllConsentNames): boolean {
		return this.consent.getDisplayedVendors(name).length > 0;
	}

	/** @internal */
	protected requestOptOut(): void {
		void this.consent.requestOptOut({ uiSource: this.uiSource() });
	}

	/** @internal */
	protected requestOptIn(): void {
		optInConsentSurface(untracked(this.consent.kernel), {
			uiSource: this.uiSource(),
		});
	}

	/** @internal */
	protected toggleConsent(name: AllConsentNames, checked: boolean): void {
		this.consent.setSelectedConsent(name, checked);
	}

	/** @internal */
	protected toggleOpenItem(name: AllConsentNames): void {
		const nextOpen = !(this.openItems()[name] ?? false);
		this.openItems.set(
			Object.fromEntries(
				this.displayedConsents().map((type) => [
					type.name,
					nextOpen && type.name === name,
				])
			)
		);
	}

	#slot(
		key: Parameters<typeof resolveStyles>[0],
		baseClassName: string | undefined
	) {
		const noStyle = this.resolvedNoStyle();
		return resolveStyles(
			key,
			this.#theme.theme(),
			{ baseClassName, noStyle },
			noStyle
		);
	}
}

/**
 * The preference center: one row per consent category, with a switch, a
 * description and the vendors listed under it, and the policy's actions
 * (accept all, reject all, save) in the footer.
 *
 * The switches stage their changes; Save records them, Accept all and
 * Reject all record a choice for every category. The consent dialog
 * renders this widget; render it on its own to put the preference center
 * in a page. It renders nothing until a policy rule is resolved for the
 * visitor, and nothing under a rule that owes no consent UI.
 *
 * @example
 * ```html
 * <inth-consent-widget [hideBranding]="false" />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The host adds no box: the root inside lays out as if it were the
	// host's place in the page.
	host: { style: 'display: contents' },
	imports: [ConsentWidgetRoot, OptInConfirmation],
	selector: 'inth-consent-widget',
	template: `@if (consent.hasConsentUi()) {
		<inth-opt-in-confirmation [noStyle]="noStyle()" />
		<div
			data-testid="consent-widget-root"
			[hideBranding]="hideBranding()"
			[noStyle]="noStyle()"
			[rootClass]="rootClass()"
		></div>
	}`,
})
export class ConsentWidget {
	/** @internal */
	protected readonly consent = inject(ConsentManager);

	/** Hide the "Secured by" attribution. */
	readonly hideBranding = input(true);
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Extra class for the widget's root element. */
	readonly rootClass = input<string | undefined>(undefined);
}
