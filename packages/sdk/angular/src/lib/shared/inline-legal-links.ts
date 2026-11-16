import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
} from '@angular/core';
import type { LegalLinks } from '@c15t/core';
import legalLinkStyles from '@c15t/ui/styles/components/legal-links';

import { ConsentManager } from '../core/consent-manager';
import { resolveNoStyle } from '../core/no-style';
import { resolvedTranslations } from './translations';

/** Which legal links a surface shows. `null` or unset shows none. */
export type LegalLinkSelection = readonly (keyof LegalLinks)[] | null;

/** One legal link to render. @internal */
export interface LegalLinkEntry {
	readonly type: keyof LegalLinks;
	readonly href: string;
	readonly target: string;
	readonly rel: string | null;
	readonly label: string | undefined;
}

/**
 * The provider's legal links that a surface selected, in the provider's
 * order. Wrap the {@link InlineLegalLinks} host in `@if` on a
 * non-empty result.
 *
 * @param all - `ConsentManager.legalLinks()`.
 * @param links - The surface's `legalLinks` input.
 * @returns The links to render; empty when there are none.
 * @internal
 */
export const selectLegalLinks = function selectLegalLinks(
	all: LegalLinks | undefined,
	links: LegalLinkSelection | undefined
): LegalLinkEntry[] {
	if (!(links && all)) {
		return [];
	}
	const entries: LegalLinkEntry[] = [];
	for (const [type, link] of Object.entries(all) as [
		keyof LegalLinks,
		LegalLinks[keyof LegalLinks],
	][]) {
		if (!(link && links.includes(type))) {
			continue;
		}
		entries.push({
			href: link.href,
			label: link.label,
			rel:
				link.rel || (link.target === '_blank' ? 'noopener noreferrer' : null),
			target: link.target || '_blank',
			type,
		});
	}
	return entries;
};

/**
 * The legal links that follow a surface's description inline. The host is
 * the wrapping `<span>`; render it only when {@link selectLegalLinks}
 * returns links.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'span[c15t-inline-legal-links]',
	// A space before the links and after each comma, as in React's
	// `InlineLegalLinks`.
	template: `<ng-container>{{ ' ' }}</ng-container>
		@for (link of entries(); track link.type; let last = $last) {
			<span
				><a
					[href]="link.href"
					[attr.target]="link.target"
					[attr.rel]="link.rel"
					[attr.class]="linkClass()"
					[attr.data-testid]="
						testIdPrefix() ? testIdPrefix() + '-' + link.type : null
					"
					>{{ labelOf(link) }}{{ last ? '' : ',' }}</a
				>{{ last ? '' : ' ' }}</span
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

	readonly #translations = resolvedTranslations(this.#consent);

	/** @internal */
	protected readonly entries = computed(() =>
		selectLegalLinks(this.#consent.legalLinks(), this.links())
	);
	/** @internal */
	protected readonly linkClass = computed(() =>
		this.#noStyle() ? null : legalLinkStyles.legalLink || null
	);

	/** @internal */
	protected labelOf(link: LegalLinkEntry): string {
		return (
			link.label ??
			(this.#translations().legalLinks as Record<string, string> | undefined)?.[
				link.type
			] ??
			link.type
		);
	}
}
