import {
	ChangeDetectionStrategy,
	Component,
	input,
	signal,
} from '@angular/core';
import { ɵresolveNoStyle as resolveNoStyle } from '@inth/angular';
import type { ProcessedFeature } from '@inth/sdk/iab/headless';
import type { ResolvedIABCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';

import { ChevronRightIcon } from './iab-icons';
import { PREFERENCE_ITEM } from './iab-purpose-item';

/**
 * One informational IAB Feature row.
 *
 * TCF Policies v5.0.b forbid showing Features next to a control that cannot
 * be disabled, so this row has no switch, no lock and no per-vendor
 * toggles. It shows the name, the description, the illustrations and the
 * names of the vendors that use the feature.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [...PREFERENCE_ITEM, ChevronRightIcon],
	selector: 'inth-iab-feature-item',
	template: `
		@let t = iabT().preferenceCenter;
		<div
			inthPreferenceItem
			[(open)]="isExpanded"
			[noStyle]="true"
			[class]="cls(styles.purposeItem)"
			[attr.data-testid]="testId() ?? 'feature-item-' + feature().id"
		>
			<div [class]="cls(styles.purposeHeader)">
				<button
					inthPreferenceItemTrigger
					[class]="cls(styles.purposeTrigger)"
				>
					<span inthPreferenceItemLeading>
						<svg
							inth-chevron-right-icon
							aria-hidden="true"
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
							{{ feature().name }}
						</h3>
						<p
							inthPreferenceItemMeta
							[class]="cls(styles.purposeMeta)"
						>
							{{
								t.purposeItem.partners.replace(
									'{count}',
									'' + feature().vendors.length
								)
							}}
						</p>
					</div>
				</button>
			</div>

			<div
				inth-preference-item-content
				[innerClassName]="cls(styles.purposeContent)"
				[noStyle]="resolvedNoStyle()"
			>
				<ng-template inthPreferenceItemBody>
					<p [class]="cls(styles.purposeDescription)">
						{{ feature().description }}
					</p>

					@if (feature().illustrations.length > 0) {
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
										aria-hidden="true"
										style="height: 0.75rem; width: 0.75rem"
										[expanded]="showExamples()"
									></svg>
									{{ t.purposeItem.examples }}
									({{ feature().illustrations.length }})
								</button>
								<div
									inth-preference-item-content
									[noStyle]="resolvedNoStyle()"
								>
									<ng-template inthPreferenceItemBody>
										<ul [class]="cls(styles.examplesList)">
											@for (
												illustration of feature().illustrations;
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

					@if (feature().vendors.length > 0) {
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
										aria-hidden="true"
										style="height: 0.75rem; width: 0.75rem"
										[expanded]="showVendors()"
									></svg>
									{{ t.vendorList.iabVendorsHeading }}
									({{ feature().vendors.length }})
								</button>
								<div
									inth-preference-item-content
									[noStyle]="resolvedNoStyle()"
								>
									<ng-template inthPreferenceItemBody>
										<ul [class]="cls(styles.examplesList)">
											@for (vendor of feature().vendors; track vendor.id) {
												<li>{{ vendor.name }}</li>
											}
										</ul>
									</ng-template>
								</div>
							</div>
						</div>
					}
				</ng-template>
			</div>
		</div>
	`,
})
export class IABFeatureItem {
	readonly feature = input.required<ProcessedFeature>();
	/** The row's `data-testid`, from the shared display model. */
	readonly testId = input<string | undefined>(undefined);
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** The IAB copy. */
	readonly iabT = input.required<ResolvedIABCopy>();

	/** @internal */
	protected readonly styles = styles as Record<string, string | undefined>;
	/** @internal */
	protected readonly isExpanded = signal(false);
	/** @internal */
	protected readonly showExamples = signal(false);
	/** @internal */
	protected readonly showVendors = signal(false);

	/** @internal */
	protected cls(name: string | undefined): string {
		return this.resolvedNoStyle() ? '' : name || '';
	}
}
