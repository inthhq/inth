import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	signal,
} from '@angular/core';
import { ɵresolveNoStyle as resolveNoStyle } from '@inth/angular';
import { countIABPartners } from '@inth/sdk/iab/headless';
import type {
	HeadlessIABVendorId,
	ProcessedStack,
} from '@inth/sdk/iab/headless';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import switchStyles from '@inth/sdk/ui/styles/components/switch';

import { ChevronRightIcon } from './iab-icons';
import { IABPurposeItem, PREFERENCE_ITEM, SWITCH } from './iab-purpose-item';
import type {
	IABPurposeChoice,
	IABPurposeRow,
	IABVendorChoice,
} from './iab-purpose-item';
import type { IABTranslations } from './iab-translations';

/** A stack, or a display-model row whose purposes carry `hasConsentBasis`. */
export type IABStackRow = Omit<ProcessedStack, 'purposes'> & {
	purposes: IABPurposeRow[];
};

/**
 * One IAB stack: a switch over the purposes it covers, and those purposes
 * as rows of their own once it opens.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [...PREFERENCE_ITEM, ...SWITCH, ChevronRightIcon, IABPurposeItem],
	selector: 'inth-iab-stack-item',
	template: `
		<div
			inthPreferenceItem
			[(open)]="isExpanded"
			[noStyle]="true"
			[class]="cls(styles.stackItem)"
			[attr.data-testid]="'stack-item-' + stack().id"
		>
			<div [class]="cls(styles.stackHeader)">
				<button
					inthPreferenceItemTrigger
					[class]="cls(styles.stackTrigger)"
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
						[class]="cls(styles.stackInfo)"
					>
						<h3
							inthPreferenceItemTitle
							[class]="cls(styles.stackName)"
						>
							{{ stack().name }}
						</h3>
						<p
							inthPreferenceItemMeta
							[class]="cls(styles.stackMeta)"
						>
							{{ totalVendors() }}
							{{
								totalVendors() === 1
									? iabT().preferenceCenter.vendorList.partnerSingular
									: iabT().preferenceCenter.vendorList.partnerPlural
							}}
						</p>
					</div>
				</button>
				<div
					inthPreferenceItemControl
					[class]="cls(styles.stackControls)"
				>
					@if (someEnabled()) {
						<span [class]="cls(styles.srOnly)">Partially enabled</span>
						<div [class]="cls(styles.partialIndicator)"></div>
					}
					@if (consentPurposes().length > 0) {
						<button
							inthSwitch
							[attr.aria-label]="stack().name"
							[checked]="allEnabled()"
							(checkedChange)="setStackConsent($event)"
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
					}
				</div>
			</div>

			<div
				inth-preference-item-content
				[noStyle]="resolvedNoStyle()"
			>
				<ng-template inthPreferenceItemBody>
					<div [class]="cls(styles.stackDescription)">
						<p>{{ stack().description }}</p>
					</div>
					<div [class]="cls(styles.stackContent)">
						@for (purpose of stack().purposes; track purpose.id) {
							<inth-iab-purpose-item
								[purpose]="purpose"
								[isEnabled]="consents()[purpose.id] ?? false"
								[vendorConsents]="vendorConsents()"
								[vendorLegitimateInterests]="vendorLegitimateInterests()"
								[purposeLegitimateInterests]="purposeLegitimateInterests()"
								[purposeObjection]="purposeObjection()"
								[vendorObjection]="vendorObjection()"
								[noStyle]="resolvedNoStyle()"
								[iabT]="iabT()"
								(purposeToggle)="
									purposeToggle.emit({ purposeId: purpose.id, value: $event })
								"
								(vendorToggle)="vendorToggle.emit($event)"
								(vendorClick)="vendorClick.emit($event)"
								(vendorLegitimateInterestToggle)="
									vendorLegitimateInterestToggle.emit($event)
								"
								(purposeLegitimateInterestToggle)="
									purposeLegitimateInterestToggle.emit($event)
								"
							/>
						}
					</div>
				</ng-template>
			</div>
		</div>
	`,
})
export class IABStackItem {
	readonly stack = input.required<IABStackRow>();
	/** Consent per purpose. */
	readonly consents = input<Readonly<Record<number, boolean>>>({});
	/** Consent per vendor, keyed by vendor id. */
	readonly vendorConsents = input<Readonly<Record<string, boolean>>>({});
	/** Legitimate interest per vendor. */
	readonly vendorLegitimateInterests = input<Readonly<Record<string, boolean>>>(
		{}
	);
	/** Legitimate interest per purpose. */
	readonly purposeLegitimateInterests = input<
		Readonly<Record<number, boolean>>
	>({});
	/**
	 * Offer the purpose-level objection. Purposes with no vendor on consent
	 * then leave the stack switch, which would change nothing for them.
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

	/** A purpose's consent changed. */
	readonly purposeToggle = output<IABPurposeChoice>();
	/** A vendor's consent switch changed. */
	readonly vendorToggle = output<IABVendorChoice>();
	/** A vendor name was clicked. */
	readonly vendorClick = output<HeadlessIABVendorId>();
	/** A vendor's objection changed. */
	readonly vendorLegitimateInterestToggle = output<IABVendorChoice>();
	/** A purpose's objection changed. */
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

	/**
	 * The purposes some vendor processes on consent. The others offer only
	 * their own objection control; without one, the rows keep their consent
	 * switch and the stack covers them too.
	 *
	 * @internal
	 */
	protected readonly consentPurposes = computed(() =>
		this.stack().purposes.filter(
			(p) => p.hasConsentBasis !== false || !this.purposeObjection()
		)
	);
	/** @internal */
	protected readonly allEnabled = computed(() =>
		this.consentPurposes().every((p) => this.consents()[p.id] ?? false)
	);
	/** @internal */
	protected readonly someEnabled = computed(
		() =>
			this.consentPurposes().some((p) => this.consents()[p.id] ?? false) &&
			!this.allEnabled()
	);
	/** @internal */
	protected readonly totalVendors = computed(() =>
		countIABPartners(this.stack().purposes)
	);

	/** @internal */
	protected cls(name: string | undefined): string {
		return this.resolvedNoStyle() ? '' : name || '';
	}

	/** @internal */
	protected setStackConsent(value: boolean): void {
		for (const purpose of this.consentPurposes()) {
			this.purposeToggle.emit({ purposeId: purpose.id, value });
			for (const vendor of purpose.vendors) {
				if (!vendor.usesLegitimateInterest) {
					this.vendorToggle.emit({ value, vendorId: vendor.id });
				}
			}
		}
	}
}
