import type { LegalLinks } from '@inth/sdk-core';
import type { LegalLinksTranslations } from '@inth/sdk-translations';

/** Which legal links a surface shows. `null` or unset shows none. */
export type LegalLinkKeys = readonly (keyof LegalLinks)[] | null | undefined;

/** One legal link, ready to render. */
export interface LegalLinkEntry {
	readonly key: keyof LegalLinks;
	readonly href: string;
	readonly label: string;
	readonly target: '_blank' | '_self';
	/** The link's own `rel`, else `noopener noreferrer` for a new tab. */
	readonly rel: string | undefined;
	/** Whether a comma and a space follow it: every link but the last. */
	readonly separated: boolean;
}

/** English labels, as in `@inth/sdk-translations/en`; a test keeps them equal. */
export const ENGLISH_LEGAL_LINK_LABELS: LegalLinksTranslations = {
	cookiePolicy: 'Cookie Policy',
	privacyPolicy: 'Privacy Policy',
	termsOfService: 'Terms of Service',
};

/**
 * The legal links a surface shows after its description, in the order the
 * surface asks for. A link without an `href` is skipped. A link opens in a
 * new tab unless it sets `target: '_self'`. A label falls back to the
 * translation for its type, then to English.
 *
 * Every stock surface renders them the same way: a space first, then each
 * link, with a comma inside every link but the last and a space after it.
 *
 * @param links - The configured legal links.
 * @param keys - Which links the surface shows.
 * @param labels - The active language's `legalLinks` translations.
 * @returns The links to render; empty when there are none.
 */
export const resolveLegalLinkEntries = function resolveLegalLinkEntries(
	links: LegalLinks | undefined,
	keys: LegalLinkKeys,
	labels?: Partial<LegalLinksTranslations>
): LegalLinkEntry[] {
	if (!(links && keys)) {
		return [];
	}
	const present = keys.filter((key) => links[key]?.href);
	return present.map((key, index) => {
		const link = links[key] as NonNullable<LegalLinks[typeof key]>;
		const target = link.target || '_blank';
		return {
			href: link.href,
			key,
			label: link.label ?? labels?.[key] ?? ENGLISH_LEGAL_LINK_LABELS[key],
			rel:
				link.rel || (target === '_blank' ? 'noopener noreferrer' : undefined),
			separated: index < present.length - 1,
			target,
		};
	});
};
