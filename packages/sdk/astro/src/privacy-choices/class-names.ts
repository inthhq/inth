/**
 * The stylesheet class names the Privacy Choices markup uses.
 *
 * Imported on the server only, like `../banner/class-names`. The browser
 * reads them from the spot `<ConsentBanner />` leaves beside the prompt,
 * because in the browser these modules also import their stylesheets, and
 * Astro links every stylesheet a page script can reach.
 *
 * @internal
 */

import buttonStyles from '@inth/sdk/ui/styles/components/button';
import barStyles from '@inth/sdk/ui/styles/components/consent-banner';
import cardStyles from '@inth/sdk/ui/styles/components/consent-card';
import drawerStyles from '@inth/sdk/ui/styles/components/consent-drawer';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import choicesStyles from '@inth/sdk/ui/styles/components/consent-dialog';

import type { ClassNameMap } from '../banner/class-names';

/** The class maps the Privacy Choices prompt and its options read. */
export interface PrivacyChoicesClassNames {
	/** The shell every presentation renders (`consent-surface`). */
	surface: ClassNameMap;
	/** One map per presentation: `consent-card`, `consent-bar`, `consent-drawer`. */
	card: ClassNameMap;
	bar: ClassNameMap;
	drawer: ClassNameMap;
	/** The in-place panel and the scroll area (`consent-expand`). */
	expand: ClassNameMap;
	/** The rows inside the options (`privacy-choices`). */
	choices: ClassNameMap;
	button: ClassNameMap;
	legalLinks: ClassNameMap;
}

const pick = function pick(
	source: Record<string, string>,
	keys: readonly string[]
): ClassNameMap {
	return Object.fromEntries(keys.map((key) => [key, source[key]]));
};

/** What the prompt and its options use, trimmed so the spot stays small. */
export const privacyChoicesClassNames: PrivacyChoicesClassNames = {
	bar: pick(barStyles, [
		'actionGroup',
		'actions',
		'card',
		'footer',
		'head',
		'root',
		'row',
		'shell',
		'tag',
		'text',
	]),
	button: pick(buttonStyles, ['button']),
	card: pick(cardStyles, ['card', 'head', 'root', 'shell', 'tag']),
	choices: pick(choicesStyles, [
		'bleed',
		'category',
		'categoryDescription',
		'categoryName',
		'categoryRow',
		'categoryState',
		'categoryText',
		'chevron',
		'confirm',
		'confirmActions',
		'confirmDescription',
		'confirmTitle',
		'disclosure',
		'disclosureInner',
		'navRow',
		'navRowLabel',
		'navRowMeta',
		'note',
		'preferencesBody',
		'right',
		'rightDescription',
		'rightTitle',
		'segmented',
		'segmentedCheck',
		'segmentedOption',
		'segmentedThumb',
		'switch',
		'vendorHead',
		'vendorLink',
		'vendorMeta',
		'vendorName',
		'vendorPurpose',
		'vendorRow',
		'vendorTable',
		'vendorTrigger',
		'visuallyHidden',
	]),
	drawer: pick(drawerStyles, [
		'body',
		'card',
		'footer',
		'head',
		'root',
		'shell',
		'tag',
		'tagSlot',
	]),
	expand: pick(expandStyles, ['group', 'inner', 'panel', 'scroll']),
	legalLinks: pick(legalLinkStyles, ['legalLink']),
	surface: pick(surfaceStyles, [
		'actionGroup',
		'card',
		'description',
		'footer',
		'head',
		'rightLink',
		'root',
		'scrim',
		'shell',
		'tag',
		'tagMark',
		'title',
		'visuallyHidden',
	]),
};
