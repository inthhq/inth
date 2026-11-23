import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
} from '@angular/core';
import type { LegalLinks } from '@inth/sdk/engine';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';
import { resolveNoStyle } from '../core/no-style-scope';

/** Which legal links a surface shows. `null` or unset shows none. */
export type LegalLinkSelection = readonly (keyof LegalLinks)[] | null;

/**
 * The legal links that follow a surface's description inline. The host is
 * the wrapping `<span>`; render it only when `resolveLegalLinkEntries`
 * returns links.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'span[inth-inline-legal-links]',
	// A space before the links and after each comma, as in React's
	// `InlineLegalLinks`.
	template: `<ng-container>{{ ' ' }}</ng-container>
		@for (link of entries(); track link.key) {
			<span
				><a
					[href]="link.href"
					[attr.target]="link.target"
					[attr.rel]="link.rel ?? null"
					[attr.class]="linkClass()"
					[attr.data-testid]="
						testIdPrefix() ? testIdPrefix() + '-' + link.key : null
					"
					>{{ link.label }}{{ link.separated ? ',' : '' }}</a
				>{{ link.separated ? ' ' : '' }}</span
			>
		}`,
})
export class InlineLegalLinks {
	readonly #consent = inject(ConsentManager);

	/** Which of the provider's legal links to show. */
	readonly links = input<LegalLinkSelection | undefined>(undefined);
	/** Prefix for each link's `data-testid`, followed by `-<type>`. */
	readonly testIdPrefix = input<string | undefined>(undefined);
	/** Drop the stock classes. Defaults to the surface's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly #noStyle = resolveNoStyle(this.noStyle);

	readonly #translations = this.#consent.copy;

	/** @internal */
	protected readonly entries = computed(() =>
		resolveLegalLinkEntries(
			this.#consent.legalLinks(),
			this.links(),
			this.#translations().legalLinks
		)
	);
	/** @internal */
	protected readonly linkClass = computed(() =>
		this.#noStyle() ? null : legalLinkStyles.legalLink || null
	);
}
