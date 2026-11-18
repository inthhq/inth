import type { ConsentSnapshot, LegalLinks } from '@inth/sdk-core';
import type { LegalLinksTranslations } from '@inth/sdk-translations';
import { resolveLegalLinkEntries } from '@inth/sdk-ui/utils/legal-links';

import { classes } from '../generated/styles';
import type { ConsentClient } from '../types';
import { h } from './dom';
import type { SlotApplier } from './slots';

/** What every surface renders against. */
export interface SurfaceContext {
	/** The client whose kernel drives the surface. */
	client: ConsentClient;
	/** The `.inth-theme-root` element surfaces append to. */
	root: HTMLElement;
	/** Ship the DOM without class names. */
	noStyle: boolean;
	/** Skip enter and exit transitions. */
	disableAnimation: boolean;
	/** The site's legal links, if configured. */
	legalLinks: LegalLinks | undefined;
	/** Marks an element as a `theme.slots` part and applies its overrides. */
	slot: SlotApplier;
}

/** A mounted surface. */
export interface Surface {
	/** Reconcile the DOM with a snapshot. */
	sync: (snapshot: ConsentSnapshot) => void;
	/** Remove the surface and release listeners. */
	destroy: () => void;
}

/** What {@link renderLegalLinks} needs. */
export interface LegalLinksParams {
	/** Which links to render; `null` or empty renders none. */
	keys: (keyof LegalLinks)[] | null | undefined;
	/** The configured links. */
	legalLinks: LegalLinks | undefined;
	/** Translated labels, used when a link carries none of its own. */
	labels: Partial<LegalLinksTranslations>;
	/** Prefix for each link's test id. */
	testIdPrefix: string;
	/** Ship the DOM without class names. */
	noStyle: boolean;
}

/**
 * Render the inline legal links a surface shows after its description.
 *
 * Matches the React banner's `InlineLegalLinks`: a space first, then each
 * link, with a comma inside every link but the last and a space after it.
 *
 * @returns A wrapper holding the links, or nothing when there are none.
 */
export const renderLegalLinks = function renderLegalLinks(
	params: LegalLinksParams
): HTMLElement[] {
	const entries = resolveLegalLinkEntries(
		params.legalLinks,
		params.keys,
		params.labels
	);
	if (entries.length === 0) {
		return [];
	}
	return [
		h(
			'span',
			{},
			' ',
			...entries.map((link) =>
				h(
					'span',
					{},
					h(
						'a',
						{
							class: params.noStyle ? '' : classes.legalLinks.legalLink,
							'data-testid': `${params.testIdPrefix}-${link.key}`,
							href: link.href,
							rel: link.rel,
							target: link.target,
						},
						link.separated ? `${link.label},` : link.label
					),
					link.separated ? ' ' : null
				)
			)
		),
	];
};
