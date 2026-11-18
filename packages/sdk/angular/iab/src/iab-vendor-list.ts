import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DOCUMENT,
	effect,
	inject,
	input,
	output,
	PLATFORM_ID,
	signal,
	untracked,
} from '@angular/core';
import { ɵresolveNoStyle as resolveNoStyle } from '@inth/angular';
import { uniqueId } from '@inth/angular/primitives';
import type { AdTechProvider, GlobalVendorList } from '@inth/sdk/engine';
import {
	resolveIABSafeUrl,
	resolveIABVendorUrls,
} from '@inth/sdk/iab/headless';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import switchStyles from '@inth/sdk/ui/styles/components/switch';
import { switchVariants } from '@inth/sdk/ui/styles/primitives';

import {
	ChevronDownIcon,
	CloseIcon,
	ExternalLinkIcon,
	GlobeIcon,
	LayersIcon,
	LegitimateInterestIcon,
	LockIcon,
	SearchIcon,
	ShareIcon,
} from './iab-icons';
import { PREFERENCE_ITEM, SWITCH } from './iab-purpose-item';
import type { IABVendorChoice } from './iab-purpose-item';
import type { IABTranslations } from './iab-translations';
import type {
	NonIABVendor,
	ProcessedPurpose,
	ProcessedVendor,
	VendorId,
} from './iab-types';

const sw = switchVariants();

/** An ad tech provider's consent choice. */
export interface IABAdTechProviderChoice {
	readonly providerId: number;
	readonly value: boolean;
}

type VendorPurposeEntry = ProcessedPurpose & {
	usesLegitimateInterest: boolean;
};

interface SimpleEntry {
	id: number;
	name: string;
	description: string;
}

/** A row's key: registered and custom vendors may share an id. */
const vendorRowKey = (vendor: { id: VendorId; isCustom?: boolean }): string =>
	`${vendor.isCustom ? 'custom' : 'gvl'}:${String(vendor.id)}`;

/** What one vendor row renders, computed once per vendor. */
interface VendorRow {
	vendor: ProcessedVendor;
	/** The vendor's id, as the choice maps key it. */
	id: string;
	/** `gvl:<id>` or `custom:<id>`, so the two kinds never share a row. */
	key: string;
	/** `gvl-vendor-<id>` or `custom-vendor-<id>`, for the row's element id. */
	domKey: string;
	purposes: VendorPurposeEntry[];
	specialPurposes: SimpleEntry[];
	specialFeatures: SimpleEntry[];
	features: SimpleEntry[];
	legIntCount: number;
	hasLegitimateInterest: boolean;
	maxAgeText: string | null;
	metaText: string;
}

const lookup = function lookup(
	ids: readonly number[],
	table: Record<string, { id: number; name: string; description: string }>
): SimpleEntry[] {
	const entries: SimpleEntry[] = [];
	for (const id of ids) {
		const entry = table[id];
		if (entry) {
			entries.push({
				description: entry.description,
				id: entry.id,
				name: entry.name,
			});
		}
	}
	return entries;
};

/**
 * The vendors tab of the IAB preference centre: IAB vendors, custom
 * (non-IAB) vendors and Google ad tech providers, with search.
 *
 * Sized for a full Global Vendor List: each vendor's purposes, special
 * purposes, features and badges are worked out once per list change
 * (O(vendors + purposes)), not per render, and a row's details are created
 * only when it first opens.
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
		ChevronDownIcon,
		CloseIcon,
		ExternalLinkIcon,
		GlobeIcon,
		LayersIcon,
		LegitimateInterestIcon,
		LockIcon,
		SearchIcon,
		ShareIcon,
	],
	selector: 'inth-iab-vendor-list',
	template: `
		@let t = iabT().preferenceCenter;
		<div>
			@if (selectedVendorId() !== null) {
				<div [class]="cls(styles.selectedVendorBanner)">
					<p [class]="cls(styles.selectedVendorText)">
						{{ iabT().common.showingSelectedVendor }}
					</p>
					<button
						type="button"
						(click)="clearSelection.emit()"
						[class]="cls(styles.clearSelectionButton)"
					>
						<svg
							inth-close-icon
							[class]="cls(styles.clearIcon)"
							width="16"
							height="16"
						></svg>
						{{ iabT().common.clearSelection }}
					</button>
				</div>
			} @else {
				<div [class]="cls(styles.vendorListHeader)">
					<div [class]="cls(styles.searchContainer)">
						<svg
							inth-search-icon
							[class]="cls(styles.searchIcon)"
						></svg>
						<input
							type="text"
							[placeholder]="t.vendorList.search"
							[value]="searchTerm()"
							(input)="updateSearch($event)"
							[class]="cls(styles.searchInput)"
						/>
					</div>
					<p [class]="cls(styles.vendorCount)">
						{{
							t.vendorList.showingCount
								.replace('{filtered}', '' + filteredCount())
								.replace('{total}', '' + totalCount())
						}}
					</p>
				</div>
			}

			@if (filteredIABRows().length > 0) {
				<div [class]="cls(styles.vendorSection)">
					<div [class]="cls(styles.iabVendorSectionHeader)">
						<h3 [class]="cls(styles.vendorSectionHeading)">
							<svg
								inth-layers-icon
								[class]="cls(styles.vendorSectionIcon)"
							></svg>
							{{ t.vendorList.iabVendorsHeading }}
							({{ filteredIABRows().length }})
						</h3>
						<p [class]="cls(styles.iabVendorNotice)">
							{{ t.vendorList.iabVendorsNotice }}
						</p>
					</div>
					<div>
						@for (row of filteredIABRows(); track row.key) {
							<div
								inthPreferenceItem
								[open]="expandedVendors().has(row.key)"
								(openChange)="setExpanded(row.key, $event)"
								[noStyle]="true"
								[id]="idPrefix + '-' + row.domKey"
								[class]="
									cls(
										styles.vendorListItem,
										row.vendor.isCustom ? styles.customVendorItem : ''
									)
								"
							>
								<div [class]="cls(styles.vendorListItemHeader)">
									<button
										inthPreferenceItemTrigger
										[class]="cls(styles.vendorListTrigger)"
									>
										<div [class]="cls(styles.vendorListInfo)">
											<h3 [class]="cls(styles.vendorListName)">
												{{ row.vendor.name }}
											</h3>
											<div [class]="cls(styles.vendorListMeta)">
												<span [class]="cls(styles.vendorListMetaText)">
													{{ row.metaText }}
												</span>
												@if (row.legIntCount > 0) {
													<span [class]="cls(styles.vendorListLiBadge)">
														<svg
															inth-legitimate-interest-icon
															style="height: 0.625rem; width: 0.625rem"
														></svg>
														{{ row.legIntCount }}
														{{ t.vendorList.legitimateInterest }}
													</span>
												}
											</div>
										</div>
										<svg
											inth-chevron-down-icon
											[class]="cls(styles.purposeArrow)"
											[expanded]="expandedVendors().has(row.key)"
										></svg>
									</button>
									<ng-container
										*ngTemplateOutlet="
											consentSwitch;
											context: { $implicit: row.vendor }
										"
									/>
								</div>

								<div
									inth-preference-item-content
									[innerClassName]="cls(styles.vendorListContent)"
									[noStyle]="resolvedNoStyle()"
								>
									<ng-template inthPreferenceItemBody>
										<div [class]="cls(styles.vendorLinks)">
											@if (row.vendor.policyUrl) {
												<ng-container
													*ngTemplateOutlet="
														vendorLink;
														context: {
															$implicit: row.vendor.policyUrl,
															label: t.vendorList.privacyPolicy,
														}
													"
												/>
											}
											@if (row.vendor.legitimateInterestUrl) {
												<ng-container
													*ngTemplateOutlet="
														vendorLink;
														context: {
															$implicit: row.vendor.legitimateInterestUrl,
															label: t.purposeItem.legitimateInterest,
														}
													"
												/>
											}
											@if (row.vendor.deviceStorageDisclosureUrl) {
												<ng-container
													*ngTemplateOutlet="
														vendorLink;
														context: {
															$implicit: row.vendor.deviceStorageDisclosureUrl,
															label: t.vendorList.storageDisclosure,
														}
													"
												/>
											}
										</div>

										<div [class]="cls(styles.vendorBadges)">
											@if (row.vendor.usesCookies) {
												<span [class]="cls(styles.vendorBadge)">
													{{ t.vendorList.usesCookies }}
												</span>
											}
											@if (row.vendor.usesNonCookieAccess) {
												<span [class]="cls(styles.vendorBadge)">
													{{ t.vendorList.nonCookieAccess }}
												</span>
											}
											@if (row.maxAgeText) {
												<span [class]="cls(styles.vendorBadge)">
													{{ row.maxAgeText }}
												</span>
											}
											@if (row.vendor.dataRetention?.stdRetention) {
												<span [class]="cls(styles.vendorBadge)">
													{{
														t.vendorList.retention.replace(
															'{days}',
															'' + row.vendor.dataRetention.stdRetention
														)
													}}
												</span>
											}
										</div>

										@if (row.purposes.length > 0) {
											<div [class]="cls(styles.vendorPurposesList)">
												<h4 [class]="cls(styles.vendorPurposesTitle)">
													{{ t.vendorList.purposes }}
													({{ row.purposes.length }})
												</h4>
												<ul [class]="cls(styles.vendorPurposesItems)">
													@for (purpose of row.purposes; track purpose.id) {
														@let retentionDays =
															row.vendor.dataRetention?.purposes?.[
																purpose.id
															] ?? row.vendor.dataRetention?.stdRetention;
														<li
															[class]="
																cls(
																	styles.vendorPurposeItem,
																	purpose.usesLegitimateInterest
																		? styles.vendorPurposeItemLi
																		: ''
																)
															"
														>
															<span>
																{{ purpose.name }}
																@if (retentionDays) {
																	<span [class]="cls(styles.vendorRetention)">
																		({{
																			t.vendorList.retainedDays.replace(
																				'{days}',
																				'' + retentionDays
																			)
																		}})
																	</span>
																}
															</span>
															@if (purpose.usesLegitimateInterest) {
																<span [class]="cls(styles.vendorListLiBadge)">
																	<svg
																		inth-legitimate-interest-icon
																		width="10"
																		height="10"
																	></svg>
																	{{ t.vendorList.legitimateInterest }}
																</span>
															}
														</li>
													}
												</ul>
											</div>
										}

										<ng-container
											*ngTemplateOutlet="liSection; context: { $implicit: row }"
										/>

										@if (row.vendor.dataDeclaration?.length) {
											<div [class]="cls(styles.vendorPurposesList)">
												<h4 [class]="cls(styles.vendorPurposesTitle)">
													{{ t.vendorList.dataCategories }}
													({{ row.vendor.dataDeclaration.length }})
												</h4>
												<ul [class]="cls(styles.vendorPurposesItems)">
													@for (
														categoryId of row.vendor.dataDeclaration;
														track categoryId
													) {
														@let category =
															vendorData()?.dataCategories?.[categoryId];
														<li
															[class]="cls(styles.vendorPurposeItem)"
															[attr.title]="category?.description"
														>
															{{
																category?.name || 'Data Category ' + categoryId
															}}
														</li>
													}
												</ul>
											</div>
										}

										@if (row.specialPurposes.length > 0) {
											<div [class]="cls(styles.vendorPurposesList)">
												<h4 [class]="cls(styles.vendorPurposesTitle)">
													<svg
														inth-lock-icon
														role="img"
														[attr.aria-label]="t.vendorList.specialPurposes"
														[class]="cls(styles.legitimateInterestIcon)"
													></svg>
													{{ t.vendorList.specialPurposes }}
													({{ row.specialPurposes.length }})
												</h4>
												<ul [class]="cls(styles.vendorPurposesItems)">
													@for (sp of row.specialPurposes; track sp.id) {
														@let spRetention =
															row.vendor.dataRetention?.specialPurposes?.[
																sp.id
															] ?? row.vendor.dataRetention?.stdRetention;
														<li [class]="cls(styles.vendorPurposeItem)">
															<span>
																{{ sp.name }}
																@if (spRetention) {
																	<span [class]="cls(styles.vendorRetention)">
																		({{
																			t.vendorList.retainedDays.replace(
																				'{days}',
																				'' + spRetention
																			)
																		}})
																	</span>
																}
															</span>
														</li>
													}
												</ul>
												<p [class]="cls(styles.liExplanation)">
													{{ t.vendorList.requiredNotice }}
												</p>
											</div>
										}

										<ng-container
											*ngTemplateOutlet="
												featureSections;
												context: { $implicit: row }
											"
										/>
									</ng-template>
								</div>
							</div>
						}
					</div>
				</div>
			}

			@if (filteredCustomRows().length > 0) {
				<div [class]="cls(styles.vendorSection)">
					<div [class]="cls(styles.customVendorSectionHeader)">
						<h3 [class]="cls(styles.vendorSectionHeading)">
							<svg
								inth-globe-icon
								[class]="cls(styles.vendorSectionIcon)"
							></svg>
							{{ t.vendorList.customVendorsHeading }}
							({{ filteredCustomRows().length }})
						</h3>
						<p [class]="cls(styles.customVendorNotice)">
							{{ t.vendorList.customVendorsNotice }}
						</p>
					</div>
					<div>
						@for (row of filteredCustomRows(); track row.key) {
							<div
								inthPreferenceItem
								[open]="expandedVendors().has(row.key)"
								(openChange)="setExpanded(row.key, $event)"
								[noStyle]="true"
								[id]="idPrefix + '-' + row.domKey"
								[class]="cls(styles.vendorListItem, styles.customVendorItem)"
							>
								<div [class]="cls(styles.vendorListItemHeader)">
									<button
										inthPreferenceItemTrigger
										[class]="cls(styles.vendorListTrigger)"
									>
										<div [class]="cls(styles.vendorListInfo)">
											<h3 [class]="cls(styles.vendorListName)">
												{{ row.vendor.name }}
												<svg
													inth-globe-icon
													[class]="cls(styles.customVendorIcon)"
													[attr.aria-label]="iabT().common.customPartner"
												></svg>
											</h3>
										</div>
										<svg
											inth-chevron-down-icon
											[class]="cls(styles.purposeArrow)"
											[expanded]="expandedVendors().has(row.key)"
										></svg>
									</button>
									<ng-container
										*ngTemplateOutlet="
											consentSwitch;
											context: { $implicit: row.vendor }
										"
									/>
								</div>

								<div
									inth-preference-item-content
									[innerClassName]="cls(styles.vendorListContent)"
									[noStyle]="resolvedNoStyle()"
								>
									<ng-template inthPreferenceItemBody>
										<div [class]="cls(styles.vendorLinks)">
											@if (row.vendor.policyUrl) {
												<ng-container
													*ngTemplateOutlet="
														vendorLink;
														context: {
															$implicit: row.vendor.policyUrl,
															label: t.vendorList.privacyPolicy,
														}
													"
												/>
											}
										</div>

										<div [class]="cls(styles.vendorBadges)">
											@if (row.vendor.usesCookies) {
												<span [class]="cls(styles.vendorBadge)">{{
													t.vendorList.usesCookies
												}}</span>
											}
											@if (row.vendor.usesNonCookieAccess) {
												<span [class]="cls(styles.vendorBadge)">{{
													t.vendorList.nonCookieAccess
												}}</span>
											}
											@if (row.maxAgeText) {
												<span [class]="cls(styles.vendorBadge)">{{
													row.maxAgeText
												}}</span>
											}
										</div>

										@if (row.purposes.length > 0) {
											<div [class]="cls(styles.vendorPurposesList)">
												<h4 [class]="cls(styles.vendorPurposesTitle)">
													{{ t.vendorList.purposes }}
													({{ row.purposes.length }})
												</h4>
												<ul [class]="cls(styles.vendorPurposesItems)">
													@for (purpose of row.purposes; track purpose.id) {
														<li [class]="cls(styles.vendorPurposeItem)">
															{{ purpose.name }}
														</li>
													}
												</ul>
											</div>
										}

										<ng-container
											*ngTemplateOutlet="liSection; context: { $implicit: row }"
										/>
										<ng-container
											*ngTemplateOutlet="
												featureSections;
												context: { $implicit: row }
											"
										/>
									</ng-template>
								</div>
							</div>
						}
					</div>
				</div>
			}

			@if (filteredAdTechProviders().length > 0) {
				<div [class]="cls(styles.vendorSection)">
					<div [class]="cls(styles.customVendorSectionHeader)">
						<h3 [class]="cls(styles.vendorSectionHeading)">
							<svg
								inth-share-icon
								aria-hidden="true"
								[class]="cls(styles.vendorSectionIcon)"
							></svg>
							{{ t.vendorList.adTechProvidersHeading }}
							({{ filteredAdTechProviders().length }})
						</h3>
						<p [class]="cls(styles.customVendorNotice)">
							{{ t.vendorList.adTechProvidersNotice }}
						</p>
					</div>
					<div>
						@for (provider of filteredAdTechProviders(); track provider.id) {
							@let consented =
								adTechProviderConsents()['' + provider.id] ?? false;
							<div
								[id]="idPrefix + '-ad-tech-provider-' + provider.id"
								[class]="cls(styles.vendorListItem)"
							>
								<div [class]="cls(styles.vendorListItemHeader)">
									<div [class]="cls(styles.vendorListInfo)">
										<h3 [class]="cls(styles.vendorListName)">
											{{ provider.name }}
										</h3>
										<div [class]="cls(styles.vendorListMeta)">
											<ng-container
												*ngTemplateOutlet="
													vendorLink;
													context: {
														$implicit: provider.policyUrl,
														label: t.vendorList.privacyPolicy,
													}
												"
											/>
										</div>
									</div>
									<div [class]="cls(styles.vendorConsentControl)">
										<button
											inthSwitch
											[attr.aria-label]="'Consent for ' + provider.name"
											[checked]="consented"
											(checkedChange)="
												adTechProviderToggle.emit({
													providerId: provider.id,
													value: $event,
												})
											"
											[class]="
												cls(switchStyles.root, styles.vendorConsentSwitch)
											"
											data-size="medium"
										>
											<span
												inthSwitchControl
												[class]="cls(trackClass)"
											>
												<span
													inthSwitchThumb
													[class]="cls(thumbClass)"
												></span>
											</span>
										</button>
									</div>
								</div>
							</div>
						}
					</div>
				</div>
			}

			@if (filteredCount() === 0) {
				<div [class]="cls(styles.emptyState)">
					<p [class]="cls(styles.emptyStateText)">
						{{
							t.vendorList.noVendorsFound.replace('{searchTerm}', searchTerm())
						}}
					</p>
				</div>
			}
		</div>

		<ng-template
			#consentSwitch
			let-vendor
		>
			<div [class]="cls(styles.vendorConsentControl)">
				<button
					inthSwitch
					[attr.aria-label]="'Consent for ' + vendor.name"
					[checked]="vendorConsents()['' + vendor.id] ?? false"
					(checkedChange)="
						vendorToggle.emit({ vendorId: vendor.id, value: $event })
					"
					[class]="cls(switchStyles.root, styles.vendorConsentSwitch)"
					data-size="medium"
				>
					<span
						inthSwitchControl
						[class]="cls(trackClass)"
					>
						<span
							inthSwitchThumb
							[class]="cls(thumbClass)"
						></span>
					</span>
				</button>
			</div>
		</ng-template>

		<ng-template
			#vendorLink
			let-href
			let-label="label"
		>
			<a
				[href]="href"
				target="_blank"
				rel="noopener noreferrer"
				[class]="cls(styles.vendorLink)"
			>
				<svg
					inth-external-link-icon
					[class]="cls(styles.vendorLinkIcon)"
				></svg>
				{{ label }}
			</a>
		</ng-template>

		<ng-template
			#liSection
			let-row
		>
			@if (row.hasLegitimateInterest && vendorObjection()) {
				@let allowed = vendorLegitimateInterests()[row.id] ?? true;
				<div [class]="cls(styles.vendorLiSection)">
					<div [class]="cls(styles.vendorLiSectionHeader)">
						<h4 [class]="cls(styles.vendorPurposesTitle)">
							<svg
								inth-legitimate-interest-icon
								[class]="cls(styles.legitimateInterestIcon)"
							></svg>
							{{ iabT().preferenceCenter.purposeItem.legitimateInterest }}
						</h4>
						<button
							type="button"
							(click)="
								vendorLegitimateInterestToggle.emit({
									vendorId: row.vendor.id,
									value: !allowed,
								})
							"
							[class]="objectButtonClass(allowed)"
							[attr.aria-pressed]="!allowed"
						>
							{{
								allowed
									? iabT().preferenceCenter.purposeItem.objectButton
									: iabT().preferenceCenter.purposeItem.objected
							}}
						</button>
					</div>
					<p [class]="cls(styles.liExplanation)">
						{{ iabT().preferenceCenter.purposeItem.rightToObject }}
					</p>
				</div>
			}
		</ng-template>

		<ng-template
			#featureSections
			let-row
		>
			@if (row.specialFeatures.length > 0) {
				<div [class]="cls(styles.vendorPurposesList)">
					<h4 [class]="cls(styles.vendorPurposesTitle)">
						{{ iabT().preferenceCenter.vendorList.specialFeatures }}
						({{ row.specialFeatures.length }})
					</h4>
					<ul [class]="cls(styles.vendorPurposesItems)">
						@for (sf of row.specialFeatures; track sf.id) {
							<li [class]="cls(styles.vendorPurposeItem)">
								{{ sf.name }}
							</li>
						}
					</ul>
				</div>
			}
			@if (row.features.length > 0) {
				<div [class]="cls(styles.vendorPurposesList)">
					<h4 [class]="cls(styles.vendorPurposesTitle)">
						{{ iabT().preferenceCenter.vendorList.features }}
						({{ row.features.length }})
					</h4>
					<ul [class]="cls(styles.vendorPurposesItems)">
						@for (f of row.features; track f.id) {
							<li [class]="cls(styles.vendorPurposeItem)">
								{{ f.name }}
								@if (f.description) {
									<span [class]="cls(styles.vendorListMetaText)">
										{{ f.description }}
									</span>
								}
							</li>
						}
					</ul>
					<!-- TCF policy check 14: Features always carry the standard explanation. -->
					<p
						[class]="cls(styles.vendorListMetaText)"
						[attr.data-testid]="
							'vendor-' + row.vendor.id + '-features-standard-text'
						"
					>
						{{ featuresStandardText() }}
					</p>
				</div>
			}
		</ng-template>
	`,
})
export class IABVendorList {
	/** Prefix for this list's row ids, unique on the page. */
	protected readonly idPrefix = uniqueId('inth-iab-partners');
	readonly #document = inject(DOCUMENT);
	readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

	/** The vendor list, after publisher restrictions. */
	readonly vendorData = input<GlobalVendorList | null>(null);
	/** The processed purposes, which name each purpose's vendors. */
	readonly purposes = input<readonly ProcessedPurpose[]>([]);
	/** Consent per vendor, keyed by vendor id. */
	readonly vendorConsents = input<Readonly<Record<string, boolean>>>({});
	/** Show only this vendor, as picked on the purposes tab. */
	readonly selectedVendorId = input<VendorId | null>(null);
	/** Publisher-declared non-IAB vendors. */
	readonly customVendors = input<readonly NonIABVendor[]>([]);
	/** Legitimate interest per vendor; a missing vendor is allowed. */
	readonly vendorLegitimateInterests = input<Readonly<Record<string, boolean>>>(
		{}
	);
	/** Offer each legitimate-interest vendor's objection button. */
	readonly vendorObjection = input(false);
	/** Google ad tech providers disclosed for Additional Consent. */
	readonly adTechProviders = input<readonly AdTechProvider[]>([]);
	/** Consent per ad tech provider, keyed by provider id. */
	readonly adTechProviderConsents = input<Readonly<Record<string, boolean>>>(
		{}
	);
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** The IAB copy. */
	readonly iabT = input.required<IABTranslations>();
	/** The UI language, which picks each vendor's privacy links. */
	readonly language = input<string | undefined>(undefined);

	/** A vendor's consent switch changed. */
	readonly vendorToggle = output<IABVendorChoice>();
	/** A vendor's objection changed. `value` is whether LI is allowed. */
	readonly vendorLegitimateInterestToggle = output<IABVendorChoice>();
	/** An ad tech provider's consent switch changed. */
	readonly adTechProviderToggle = output<IABAdTechProviderChoice>();
	/** The visitor left the single-vendor view. */
	readonly clearSelection = output();

	/** @internal */
	protected readonly styles = styles as Record<string, string | undefined>;
	/** @internal */
	protected readonly switchStyles = switchStyles as Record<
		string,
		string | undefined
	>;
	/** @internal */
	protected readonly trackClass = sw.track();
	/** @internal */
	protected readonly thumbClass = sw.thumb();

	/** @internal */
	protected readonly searchTerm = signal('');
	/** @internal */
	protected readonly expandedVendors = signal<ReadonlySet<string>>(new Set());

	readonly #iabVendors = computed((): ProcessedVendor[] => {
		const data = this.vendorData();
		if (!data) {
			return [];
		}
		const language = this.language();
		return Object.entries(data.vendors).map(([id, vendor]) => ({
			cookieMaxAgeSeconds: vendor.cookieMaxAgeSeconds,
			cookieRefresh: vendor.cookieRefresh,
			dataDeclaration:
				(vendor as unknown as { dataDeclaration?: number[] }).dataDeclaration ||
				[],
			dataRetention: vendor.dataRetention,
			deviceStorageDisclosureUrl: resolveIABSafeUrl(
				vendor.deviceStorageDisclosureUrl
			),
			features: vendor.features || [],
			id: Number(id),
			isCustom: false,
			legIntPurposes: vendor.legIntPurposes || [],
			...resolveIABVendorUrls(vendor, language),
			name: vendor.name,
			purposes: vendor.purposes || [],
			specialFeatures: vendor.specialFeatures || [],
			specialPurposes: vendor.specialPurposes || [],
			usesCookies: vendor.usesCookies,
			usesNonCookieAccess: vendor.usesNonCookieAccess,
		}));
	});

	readonly #customVendors = computed((): ProcessedVendor[] =>
		this.customVendors().map((cv) => ({
			cookieMaxAgeSeconds: cv.cookieMaxAgeSeconds ?? null,
			cookieRefresh: undefined,
			dataDeclaration: cv.dataCategories || [],
			dataRetention: undefined,
			deviceStorageDisclosureUrl: null,
			features: cv.features || [],
			id: cv.id,
			isCustom: true,
			legIntPurposes: cv.legIntPurposes || [],
			legitimateInterestUrl: null,
			name: cv.name,
			policyUrl: resolveIABSafeUrl(cv.privacyPolicyUrl) ?? '',
			purposes: cv.purposes || [],
			specialFeatures: cv.specialFeatures || [],
			specialPurposes: [],
			usesCookies: cv.usesCookies ?? false,
			usesNonCookieAccess: cv.usesNonCookieAccess ?? false,
		}))
	);

	/**
	 * Every vendor's row data, sorted by name. Built from one pass over the
	 * purposes (O(V+P)) instead of a per-vendor scan of every purpose.
	 */
	readonly #rows = computed((): VendorRow[] => {
		const vendors = [...this.#iabVendors(), ...this.#customVendors()].sort(
			(a, b) => a.name.localeCompare(b.name)
		);
		const byVendor = new Map<string, ProcessedPurpose[]>();
		for (const purpose of this.purposes()) {
			for (const vendor of purpose.vendors) {
				const key = vendorRowKey(vendor);
				const list = byVendor.get(key);
				if (list) {
					list.push(purpose);
				} else {
					byVendor.set(key, [purpose]);
				}
			}
		}
		const data = this.vendorData();
		const t = this.iabT().preferenceCenter.vendorList;
		return vendors.map((vendor) => {
			const key = vendorRowKey(vendor);
			const kind = vendor.isCustom ? 'custom' : 'gvl';
			const purposes = (byVendor.get(key) ?? []).map((purpose) => ({
				...purpose,
				usesLegitimateInterest: vendor.legIntPurposes.includes(purpose.id),
			}));
			const specialPurposes = data
				? lookup(vendor.specialPurposes, data.specialPurposes)
				: [];
			const specialFeatures = data
				? lookup(vendor.specialFeatures, data.specialFeatures)
				: [];
			const features = data ? lookup(vendor.features || [], data.features) : [];
			let maxAgeText: string | null = null;
			if (vendor.cookieMaxAgeSeconds) {
				maxAgeText = t.maxAge.replace(
					'{days}',
					String(Math.floor(vendor.cookieMaxAgeSeconds / 86_400))
				);
				if (vendor.cookieRefresh) {
					maxAgeText = `${maxAgeText} ${t.maxAgeRefreshes}`;
				}
			}
			const special =
				specialPurposes.length > 0 ? `, ${specialPurposes.length} special` : '';
			const featureCount =
				specialFeatures.length > 0
					? `, ${specialFeatures.length} feature${specialFeatures.length === 1 ? '' : 's'}`
					: '';
			return {
				domKey: `${kind}-vendor-${String(vendor.id)}`,
				features,
				hasLegitimateInterest: vendor.legIntPurposes.length > 0,
				id: String(vendor.id),
				key,
				legIntCount: purposes.filter((p) => p.usesLegitimateInterest).length,
				maxAgeText,
				metaText: `${purposes.length} purpose${purposes.length === 1 ? '' : 's'}${special}${featureCount}`,
				purposes,
				specialFeatures,
				specialPurposes,
				vendor,
			};
		});
	});

	readonly #filteredRows = computed(() => {
		const selected = this.selectedVendorId();
		const rows = this.#rows();
		if (selected !== null) {
			return rows.filter((row) => row.id === String(selected));
		}
		const term = this.searchTerm().toLowerCase();
		return term
			? rows.filter((row) => row.vendor.name.toLowerCase().includes(term))
			: rows;
	});

	/** @internal */
	protected readonly filteredIABRows = computed(() =>
		this.#filteredRows().filter((row) => !row.vendor.isCustom)
	);
	/** @internal */
	protected readonly filteredCustomRows = computed(() =>
		this.#filteredRows().filter((row) => row.vendor.isCustom)
	);
	/**
	 * A vendor selected from the purposes tab is never an ad tech provider:
	 * providers process no TCF purposes.
	 *
	 * @internal
	 */
	protected readonly filteredAdTechProviders = computed(() => {
		if (this.selectedVendorId() !== null) {
			return [];
		}
		const term = this.searchTerm().toLowerCase();
		return this.adTechProviders().filter((provider) =>
			provider.name.toLowerCase().includes(term)
		);
	});
	/** @internal */
	protected readonly totalCount = computed(
		() => this.#rows().length + this.adTechProviders().length
	);
	/** @internal */
	protected readonly filteredCount = computed(
		() => this.#filteredRows().length + this.filteredAdTechProviders().length
	);
	/** @internal */
	protected readonly featuresStandardText = computed(
		() =>
			this.vendorData()?.standardTexts?.features ||
			this.iabT().preferenceCenter.features?.description ||
			''
	);

	constructor() {
		// Open the vendor picked on the purposes tab and scroll to it.
		effect((onCleanup) => {
			const selected = this.selectedVendorId();
			if (selected === null) {
				return;
			}
			const row = untracked(this.#rows).find(
				(candidate) => candidate.id === String(selected)
			);
			if (!row) {
				return;
			}
			untracked(() => this.setExpanded(row.key, true));
			if (!this.#browser) {
				return;
			}
			const timer = setTimeout(() => {
				const element = this.#document.getElementById(
					`${this.idPrefix}-${row.domKey}`
				);
				element?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
			}, 100);
			onCleanup(() => clearTimeout(timer));
		});
	}

	/** @internal */
	protected cls(...names: (string | undefined)[]): string {
		return this.resolvedNoStyle()
			? ''
			: names
					.map((name) => name || '')
					.join(' ')
					.trim();
	}

	/** @internal */
	protected objectButtonClass(allowed: boolean): string {
		return this.resolvedNoStyle()
			? ''
			: `${styles.objectButton || ''} ${allowed ? '' : styles.objectButtonActive || ''}`;
	}

	/** @internal */
	protected updateSearch(event: Event): void {
		this.searchTerm.set((event.target as HTMLInputElement).value);
	}

	/** @internal */
	protected setExpanded(key: string, open: boolean): void {
		this.expandedVendors.update((current) => {
			if (current.has(key) === open) {
				return current;
			}
			const next = new Set(current);
			if (open) {
				next.add(key);
			} else {
				next.delete(key);
			}
			return next;
		});
	}
}
