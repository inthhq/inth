import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
} from '@angular/core';
import type { TemplateRef } from '@angular/core';
import type { SurfacePresentation } from '@c15t/core';
import actionStyles from '@c15t/ui/styles/components/consent-actions';

import { resolveNoStyle } from '../core/no-style';

/** The context each action template renders with. */
export interface PolicyActionContext {
	/** The action id, such as `accept` or `customize`. */
	readonly $implicit: string;
	/** Whether the policy marks the action as primary. */
	readonly primary: boolean;
}

/**
 * Renders a surface footer's policy-driven action groups with the shared
 * `consent-actions` contract. Layout (fill, column, split) is carried by
 * data attributes the stock CSS reads, so every framework renders the same
 * DOM. The host is the footer; projected content goes before the groups.
 *
 * @example
 * ```html
 * <div c15t-policy-actions [actionGroups]="groups" [action]="button">
 *   <a href="/privacy">Privacy</a>
 * </div>
 * <ng-template #button let-action let-primary="primary">…</ng-template>
 * ```
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.data-direction]': 'direction()',
		'[attr.data-fill]': 'shouldFillActions() ? "true" : null',
		'[attr.data-split]':
			'actionGroups().length > 1 && !shouldFillActions() ? "true" : null',
		'[attr.data-testid]': 'footerTestId() ?? null',
		'[class]': 'footerClass()',
		'[style]': 'footerStyle() ?? ""',
	},
	imports: [NgTemplateOutlet],
	selector: 'div[c15t-policy-actions]',
	template: `<ng-content />
		@for (group of keyedGroups(); track group.key) {
			<div
				[class]="groupClass()"
				[style]="groupStyle() ?? ''"
				[attr.data-testid]="groupTestId() ?? null"
				[attr.data-direction]="direction()"
				[attr.data-fill]="shouldFillActions() ? 'true' : null"
			>
				@for (item of group.group; track item) {
					@if (action(); as template) {
						<ng-container
							[ngTemplateOutlet]="template"
							[ngTemplateOutletContext]="{
								$implicit: item,
								primary: primaryActions().includes(item),
							}"
						/>
					}
				}
			</div>
		}`,
})
export class PolicyActions {
	/** The action ids, one array per group. */
	readonly actionGroups = input<readonly (readonly string[])[]>([]);
	/** The action ids the policy marks as primary. */
	readonly primaryActions = input<readonly string[]>([]);
	/** Stretch the buttons to fill the footer. */
	readonly shouldFillActions = input(false);
	/** Lay the groups out in a row or a column. */
	readonly direction = input<SurfacePresentation['direction']>('row');
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** Extra footer class, from its theme slot. */
	readonly footerClassName = input<string | undefined>(undefined);
	/** Footer `style`, from its theme slot. */
	readonly footerStyle = input<string | undefined>(undefined);
	/** Extra group class, from its theme slot. */
	readonly groupClassName = input<string | undefined>(undefined);
	/** Group `style`, from its theme slot. */
	readonly groupStyle = input<string | undefined>(undefined);
	/** `data-testid` of the footer. */
	readonly footerTestId = input<string | undefined>(undefined);
	/** `data-testid` of each group. */
	readonly groupTestId = input<string | undefined>(undefined);
	/** Renders one action. */
	readonly action = input<TemplateRef<PolicyActionContext> | undefined>(
		undefined
	);

	/** @internal */
	protected readonly footerClass = computed(() =>
		[
			this.resolvedNoStyle() ? '' : actionStyles.actionRoot,
			this.footerClassName(),
		]
			.filter(Boolean)
			.join(' ')
	);
	/** @internal */
	protected readonly groupClass = computed(() =>
		[
			this.resolvedNoStyle() ? '' : actionStyles.actionGroup,
			this.groupClassName(),
		]
			.filter(Boolean)
			.join(' ')
	);
	/** @internal */
	protected readonly keyedGroups = computed(() =>
		this.actionGroups().map((group, index) => ({
			group,
			key: `${group.join('-')}-${index}`,
		}))
	);
}
