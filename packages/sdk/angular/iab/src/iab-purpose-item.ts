import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	signal,
} from '@angular/core';
import { ɵresolveNoStyle as resolveNoStyle } from '@inth/angular';
import {
	PreferenceItemAuxiliary,
	PreferenceItemBody,
	PreferenceItemContent,
	PreferenceItemControl,
	PreferenceItem,
	PreferenceItemHeader,
	PreferenceItemLeading,
	PreferenceItemMeta,
	PreferenceItemTitle,
	PreferenceItemTrigger,
	SwitchControl,
	Switch,
	SwitchThumb,
} from '@inth/angular/primitives';
import { countIABPartners } from '@inth/sdk/iab/headless';
import type {
	HeadlessIABVendorId,
	ProcessedPurpose,
} from '@inth/sdk/iab/headless';
import type { IABTranslations } from '@inth/sdk/translations';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import switchStyles from '@inth/sdk/ui/styles/components/switch';

import {
	ChevronRightIcon,
	GlobeIcon,
	LegitimateInterestIcon,
	LockIcon,
} from './iab-icons';

/** A vendor's choice, as the IAB rows emit it. */
export interface IABVendorChoice {
	readonly vendorId: HeadlessIABVendorId;
	readonly value: boolean;
}

/** A purpose's legitimate-interest choice. */
export interface IABPurposeChoice {
	readonly purposeId: number;
	readonly value: boolean;
}

/** A purpose, or a display-model row carrying `hasConsentBasis`. */
export type IABPurposeRow = ProcessedPurpose & { hasConsentBasis?: boolean };

/** The preference-item parts the IAB rows use. @internal */
export const PREFERENCE_ITEM = [
	PreferenceItemAuxiliary,
	PreferenceItemBody,
	PreferenceItemBody,
	PreferenceItemContent,
	PreferenceItemControl,
	PreferenceItem,
	PreferenceItemHeader,
	PreferenceItemLeading,
	PreferenceItemMeta,
	PreferenceItemTitle,
	PreferenceItemTrigger,
];

/** The switch parts the IAB rows use. @internal */
export const SWITCH = [SwitchControl, Switch, SwitchThumb];

/**
 * One purpose (or special purpose, or special feature) row of the IAB
 * preference centre: a consent switch, the description, the legitimate
 * interest objection, examples and the partners using it.
 *
 * Everything under the row's header is created when the row first opens,
 * so a closed row costs only its header.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [
		...PREFERENCE_ITEM,
		...SWITCH,
		NgTemplateOutlet,
		ChevronRightIcon,
		GlobeIcon,
		LegitimateInterestIcon,
		LockIcon,
	],
	selector: 'inth-iab-purpose-item',
	template: `
		@let t = iabT().preferenceCenter;
		<div
			inthPreferenceItem
			[(open)]="isExpanded"
			[noStyle]="true"
			[class]="cls(styles.purposeItem)"
			[attr.data-testid]="testId() ?? 'purpose-item-' + purpose().id"
		>
			<div [class]="cls(styles.purposeHeader)">
				<button
					inthPreferenceItemTrigger
					[class]="cls(styles.purposeTrigger)"
				>
					<span inthPreferenceItemLeading>
						<svg
							inth-chevron-right-icon
							[class]="cls(styles.purposeArrow)"
							[expanded]="isExpanded()"
						></svg>
					</span>
					<div
						inthPreferenceItemHeader
						[class]="cls(styles.purposeInfo)"
					>
						<h3
							inthPreferenceItemTitle
							[class]="cls(styles.purposeName)"
						>
							{{ purpose().name }}
							@if (isLocked()) {
								<svg
									inth-lock-icon
									[class]="cls(styles.lockIcon)"
								></svg>
							}
						</h3>
						<p
							inthPreferenceItemMeta
							[class]="cls(styles.purposeMeta)"
						>
							{{
								t.purposeItem.partners.replace('{count}', '' + partnerCount())
							}}
						</p>
						@if (legIntVendors().length > 0) {
							<span
								inthPreferenceItemAuxiliary
								[class]="cls(styles.legitimateInterestBadge)"
							>
								<svg
									inth-legitimate-interest-icon
									[class]="cls(styles.legitimateInterestIcon)"
								></svg>
								{{ liCountText() }}
							</span>
						}
					</div>
				</button>
				@if (showConsentSwitch()) {
					<div inthPreferenceItemControl>
						<button
							inthSwitch
							[attr.aria-label]="purpose().name"
							[checked]="isEnabled()"
							(checkedChange)="setPurposeConsent($event)"
							[disabled]="isLocked()"
							[class]="cls(switchStyles.root)"
							data-size="medium"
						>
							<span
								inthSwitchControl
								[class]="cls(switchStyles.track)"
							>
								<span
									inthSwitchThumb
									[class]="cls(switchStyles.thumb)"
								></span>
							</span>
						</button>
					</div>
				}
			</div>

			<div
				inth-preference-item-content
				[innerClassName]="cls(styles.purposeContent)"
				[noStyle]="resolvedNoStyle()"
			>
				<ng-template inthPreferenceItemBody>
					<p [class]="cls(styles.purposeDescription)">
						{{ purpose().description }}
					</p>

					@if (legIntVendors().length > 0 && purposeObjection()) {
						<div [class]="cls(styles.purposeLiSection)">
							<div [class]="cls(styles.purposeLiSectionHeader)">
								<div [class]="cls(styles.purposeLiInfo)">
									<svg
										inth-legitimate-interest-icon
										[class]="cls(styles.legitimateInterestIcon)"
									></svg>
									<span>{{ liCountText() }}</span>
								</div>
								<button
									type="button"
									(click)="toggleObjection()"
									[class]="objectButtonClass(isPurposeLIAllowed())"
									[attr.aria-pressed]="!isPurposeLIAllowed()"
								>
									{{
										isPurposeLIAllowed()
											? t.purposeItem.objectButton
											: t.purposeItem.objected
									}}
								</button>
							</div>
							<p [class]="cls(styles.liExplanation)">
								{{ t.purposeItem.rightToObject }}
							</p>
						</div>
					}

					@if (legIntVendors().length > 0 && !purposeObjection()) {
						<div [class]="cls(styles.legitimateInterestBadge)">
							<svg
								inth-legitimate-interest-icon
								[class]="cls(styles.legitimateInterestIcon)"
							></svg>
							{{ liCountText() }}
						</div>
					}

					@if (purpose().illustrations.length > 0) {
						<div>
							<div
								inthPreferenceItem
								[(open)]="showExamples"
								[noStyle]="true"
							>
								<button
									inthPreferenceItemTrigger
									[class]="cls(styles.examplesToggle)"
								>
									<svg
										inth-chevron-right-icon
										style="height: 0.75rem; width: 0.75rem"
										[expanded]="showExamples()"
									></svg>
									{{ t.purposeItem.examples }}
									({{ purpose().illustrations.length }})
								</button>
								<div
									inth-preference-item-content
									[noStyle]="resolvedNoStyle()"
								>
									<ng-template inthPreferenceItemBody>
										<ul [class]="cls(styles.examplesList)">
											@for (
												illustration of purpose().illustrations;
												track illustration
											) {
												<li>{{ illustration }}</li>
											}
										</ul>
									</ng-template>
								</div>
							</div>
						</div>
					}

					<div>
						<div
							inthPreferenceItem
							[(open)]="showVendors"
							[noStyle]="true"
						>
							<button
								inthPreferenceItemTrigger
								[class]="cls(styles.vendorsToggle)"
							>
								<svg
									inth-chevron-right-icon
									style="height: 0.75rem; width: 0.75rem"
									[expanded]="showVendors()"
								></svg>
								{{ t.purposeItem.partnersUsingPurpose }}
								({{ partnerCount() }})
							</button>
							<div
								inth-preference-item-content
								[innerClassName]="cls(styles.vendorSection)"
								[noStyle]="resolvedNoStyle()"
							>
								<ng-template inthPreferenceItemBody>
									@if (iabConsentVendors().length > 0) {
										<h5 [class]="cls(styles.vendorSectionTitle)">
											{{ t.purposeItem.withYourPermission }}
											({{ iabConsentVendors().length }})
										</h5>
										@for (vendor of iabConsentVendors(); track vendor.id) {
											<div [class]="cls(styles.vendorRow)">
												<div [class]="cls(styles.vendorInfo)">
													<button
														type="button"
														(click)="vendorClick.emit(vendor.id)"
														[class]="cls(styles.vendorName)"
													>
														<span>{{ vendor.name }}</span>
													</button>
													<div [class]="cls(styles.vendorDetails)">
														@if (vendor.usesCookies) {
															<span [class]="cls(styles.vendorDetail)">
																{{ t.vendorList.usesCookies }}
															</span>
														}
														@if (vendor.usesNonCookieAccess) {
															<span [class]="cls(styles.vendorDetail)">
																{{ t.vendorList.nonCookieAccess }}
															</span>
														}
													</div>
												</div>
												<ng-container
													*ngTemplateOutlet="
														vendorSwitch;
														context: { $implicit: vendor }
													"
												/>
											</div>
										}
									}

									@if (iabLegIntVendors().length > 0) {
										<h5
											[class]="
												cls(
													styles.vendorSectionTitle,
													styles.vendorSectionTitleLi
												)
											"
										>
											<svg
												inth-legitimate-interest-icon
												[class]="cls(styles.legitimateInterestIcon)"
											></svg>
											{{ t.purposeItem.legitimateInterest }}
											({{ iabLegIntVendors().length }})
										</h5>
										<p [class]="cls(styles.liExplanation)">
											{{ t.purposeItem.rightToObject }}
										</p>
										@for (vendor of iabLegIntVendors(); track vendor.id) {
											<div [class]="cls(styles.vendorRow, styles.vendorRowLi)">
												<div [class]="cls(styles.vendorInfo)">
													<button
														type="button"
														(click)="vendorClick.emit(vendor.id)"
														[class]="cls(styles.vendorName)"
													>
														<span>{{ vendor.name }}</span>
													</button>
													<div [class]="cls(styles.vendorDetails)">
														<span
															[class]="
																cls(styles.vendorDetail, styles.vendorDetailLi)
															"
														>
															{{ t.purposeItem.legitimateInterest }}
														</span>
														@if (vendor.usesCookies) {
															<span [class]="cls(styles.vendorDetail)">
																{{ t.vendorList.usesCookies }}
															</span>
														}
													</div>
												</div>
												<ng-container
													*ngTemplateOutlet="
														liControl;
														context: { $implicit: vendor }
													"
												/>
											</div>
										}
									}

									@if (
										customConsentVendors().length > 0 ||
										customLegIntVendors().length > 0
									) {
										<div [class]="cls(styles.customVendorPurposeSection)">
											<h5 [class]="cls(styles.vendorSectionTitleCustom)">
												<svg
													inth-globe-icon
													[class]="cls(styles.legitimateInterestIcon)"
												></svg>
												{{ t.vendorList.customVendorsHeading }}
												({{
													customConsentVendors().length +
														customLegIntVendors().length
												}})
											</h5>
											@for (vendor of customConsentVendors(); track vendor.id) {
												<div [class]="cls(styles.vendorRow)">
													<ng-container
														*ngTemplateOutlet="
															customName;
															context: { $implicit: vendor }
														"
													/>
													<ng-container
														*ngTemplateOutlet="
															vendorSwitch;
															context: { $implicit: vendor }
														"
													/>
												</div>
											}
											@for (vendor of customLegIntVendors(); track vendor.id) {
												<div
													[class]="cls(styles.vendorRow, styles.vendorRowLi)"
												>
													<ng-container
														*ngTemplateOutlet="
															customName;
															context: { $implicit: vendor }
														"
													/>
													<ng-container
														*ngTemplateOutlet="
															liControl;
															context: { $implicit: vendor }
														"
													/>
												</div>
											}
										</div>
									}

									@if (adTechProviders().length > 0) {
										<h5 [class]="cls(styles.vendorSectionTitle)">
											{{ t.vendorList.adTechProvidersHeading }}
											({{ adTechProviders().length }})
										</h5>
										@for (provider of adTechProviders(); track provider.id) {
											<div [class]="cls(styles.vendorRow)">
												<div [class]="cls(styles.vendorInfo)">
													<a
														[href]="provider.policyUrl"
														target="_blank"
														rel="noopener noreferrer"
														[class]="cls(styles.vendorName)"
													>
														{{ provider.name }}
													</a>
												</div>
											</div>
										}
									}
								</ng-template>
							</div>
						</div>
					</div>
				</ng-template>
			</div>
		</div>

		<ng-template
			#vendorSwitch
			let-vendor
		>
			<button
				inthSwitch
				[attr.aria-label]="vendor.name"
				[checked]="vendorConsent(vendor.id)"
				(checkedChange)="
					vendorToggle.emit({ vendorId: vendor.id, value: $event })
				"
				[class]="cls(switchStyles.root)"
				data-size="small"
			>
				<span
					inthSwitchControl
					[class]="cls(switchStyles.track)"
				>
					<span
						inthSwitchThumb
						[class]="cls(switchStyles.thumb)"
					></span>
				</span>
			</button>
		</ng-template>

		<ng-template
			#liControl
			let-vendor
		>
			@if (vendorObjection()) {
				<button
					type="button"
					(click)="
						vendorLegitimateInterestToggle.emit({
							vendorId: vendor.id,
							value: !vendorLegitimateInterest(vendor.id),
						})
					"
					[class]="objectButtonClass(vendorLegitimateInterest(vendor.id))"
					[attr.aria-pressed]="!vendorLegitimateInterest(vendor.id)"
				>
					{{
						vendorLegitimateInterest(vendor.id)
							? iabT().preferenceCenter.purposeItem.objectButton
							: iabT().preferenceCenter.purposeItem.objected
					}}
				</button>
			} @else {
				<ng-container
					*ngTemplateOutlet="vendorSwitch; context: { $implicit: vendor }"
				/>
			}
		</ng-template>

		<ng-template
			#customName
			let-vendor
		>
			<div [class]="cls(styles.vendorInfo)">
				<button
					type="button"
					(click)="vendorClick.emit(vendor.id)"
					[class]="cls(styles.vendorName)"
				>
					<span>{{ vendor.name }}</span>
					<svg
						inth-globe-icon
						[class]="cls(styles.customVendorIcon)"
						[attr.aria-label]="iabT().common.customPartner"
					></svg>
				</button>
			</div>
		</ng-template>
	`,
})
export class IABPurposeItem {
	/** The purpose, or a display-model row. */
	readonly purpose = input.required<IABPurposeRow>();
	/**
	 * The row's `data-testid`, from the shared display model. A purpose, a
	 * special purpose and a special feature can all be numbered `1`, so the
	 * id alone does not identify the row.
	 */
	readonly testId = input<string | undefined>(undefined);
	/** Whether the purpose's consent switch is on. */
	readonly isEnabled = input(false);
	/** Consent per vendor, keyed by vendor id. */
	readonly vendorConsents = input<Readonly<Record<string, boolean>>>({});
	/** Shows a locked row: the switch is on and cannot change. */
	readonly isLocked = input(false);
	/** Legitimate interest per vendor; a missing vendor is allowed. */
	readonly vendorLegitimateInterests = input<Readonly<Record<string, boolean>>>(
		{}
	);
	/** Legitimate interest per purpose; a missing purpose is allowed. */
	readonly purposeLegitimateInterests = input<
		Readonly<Record<number, boolean>>
	>({});
	/**
	 * Offer the purpose-level objection. Without it, a purpose whose vendors
	 * all use legitimate interest keeps its consent switch.
	 */
	readonly purposeObjection = input(false);
	/** Offer each legitimate-interest vendor's own objection button. */
	readonly vendorObjection = input(false);
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** The IAB copy. */
	readonly iabT = input.required<IABTranslations>();

	/** The consent switch changed. */
	readonly purposeToggle = output<boolean>();
	/** A vendor's consent switch changed. */
	readonly vendorToggle = output<IABVendorChoice>();
	/** A vendor name was clicked: show it on the vendors tab. */
	readonly vendorClick = output<HeadlessIABVendorId>();
	/** A vendor's objection changed. `value` is whether LI is allowed. */
	readonly vendorLegitimateInterestToggle = output<IABVendorChoice>();
	/** The purpose's objection changed. `value` is whether LI is allowed. */
	readonly purposeLegitimateInterestToggle = output<IABPurposeChoice>();

	/** @internal */
	protected readonly styles = styles as Record<string, string | undefined>;
	/** @internal */
	protected readonly switchStyles = switchStyles as Record<
		string,
		string | undefined
	>;

	/** @internal */
	protected readonly isExpanded = signal(false);
	/** @internal */
	protected readonly showExamples = signal(false);
	/** @internal */
	protected readonly showVendors = signal(false);

	/** @internal */
	protected readonly adTechProviders = computed(
		() => this.purpose().adTechProviders ?? []
	);
	/** @internal */
	protected readonly partnerCount = computed(() =>
		countIABPartners([this.purpose()])
	);
	/** @internal */
	protected readonly legIntVendors = computed(() =>
		this.purpose().vendors.filter((v) => v.usesLegitimateInterest)
	);
	readonly #consentVendors = computed(() =>
		this.purpose().vendors.filter((v) => !v.usesLegitimateInterest)
	);
	/** @internal */
	protected readonly iabConsentVendors = computed(() =>
		this.#consentVendors().filter((v) => !v.isCustom)
	);
	/** @internal */
	protected readonly customConsentVendors = computed(() =>
		this.#consentVendors().filter((v) => v.isCustom)
	);
	/** @internal */
	protected readonly iabLegIntVendors = computed(() =>
		this.legIntVendors().filter((v) => !v.isCustom)
	);
	/** @internal */
	protected readonly customLegIntVendors = computed(() =>
		this.legIntVendors().filter((v) => v.isCustom)
	);
	/** @internal */
	protected readonly isPurposeLIAllowed = computed(
		() => this.purposeLegitimateInterests()[this.purpose().id] ?? true
	);
	/**
	 * With no vendor on consent, a consent switch would look like an opt-out
	 * while every vendor kept processing; the objection control is the one
	 * that counts.
	 *
	 * @internal
	 */
	protected readonly showConsentSwitch = computed(
		() => this.purpose().hasConsentBasis !== false || !this.purposeObjection()
	);
	/** @internal */
	protected readonly liCountText = computed(() =>
		this.iabT().preferenceCenter.purposeItem.vendorsUseLegitimateInterest.replace(
			'{count}',
			String(this.legIntVendors().length)
		)
	);

	/** @internal */
	protected cls(...names: (string | undefined)[]): string {
		return this.resolvedNoStyle()
			? ''
			: names.map((name) => name || '').join(' ');
	}

	/** @internal */
	protected objectButtonClass(allowed: boolean): string {
		return this.resolvedNoStyle()
			? ''
			: `${styles.objectButton || ''} ${allowed ? '' : styles.objectButtonActive || ''}`;
	}

	/** @internal */
	protected vendorConsent(vendorId: HeadlessIABVendorId): boolean {
		return this.vendorConsents()[String(vendorId)] ?? false;
	}

	/** @internal */
	protected vendorLegitimateInterest(vendorId: HeadlessIABVendorId): boolean {
		return this.vendorLegitimateInterests()[String(vendorId)] ?? true;
	}

	/** The purpose switch also sets every consent-based vendor. @internal */
	protected setPurposeConsent(value: boolean): void {
		this.purposeToggle.emit(value);
		for (const vendor of this.#consentVendors()) {
			this.vendorToggle.emit({ value, vendorId: vendor.id });
		}
	}

	/** The purpose objection also sets every LI vendor. @internal */
	protected toggleObjection(): void {
		const value = !this.isPurposeLIAllowed();
		this.purposeLegitimateInterestToggle.emit({
			purposeId: this.purpose().id,
			value,
		});
		if (this.vendorObjection()) {
			for (const vendor of this.legIntVendors()) {
				this.vendorLegitimateInterestToggle.emit({
					value,
					vendorId: vendor.id,
				});
			}
		}
	}
}
