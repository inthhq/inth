/**
 * The stylesheet class names the consent prompt's markup uses.
 *
 * Imported on the server only, like `../banner/class-names`. The browser
 * reads them from the spot `<ConsentBanner />` leaves beside the prompt,
 * because in the browser these modules also import their stylesheets, and
 * Astro links every stylesheet a page script can reach.
 *
 * @internal
 */

import buttonStyles from '@inth/sdk/ui/styles/components/button';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
import cardStyles from '@inth/sdk/ui/styles/components/consent-card';
import dialogStyles from '@inth/sdk/ui/styles/components/consent-dialog';
import drawerStyles from '@inth/sdk/ui/styles/components/consent-drawer';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';

import type { ClassNameMap } from '../banner/banner-class-names.model';

/** The class maps the consent prompt and its options read. */
export interface PromptClassNames {
	/** The shell every container renders (`consent-surface`). */
	surface: ClassNameMap;
	/** One map per container: `consent-card`, `consent-banner`, `consent-drawer`. */
	card: ClassNameMap;
	banner: ClassNameMap;
	drawer: ClassNameMap;
	/** The in-place panel and the scroll area (`consent-expand`). */
	expand: ClassNameMap;
	/** The rows inside the options, which the dialog shares (`consent-dialog`). */
	dialog: ClassNameMap;
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
export const promptClassNames: PromptClassNames = {
	banner: pick(bannerStyles, [
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
	dialog: pick(dialogStyles, [
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
	legalLinks: pick(legalLinkStyles, ['legalLink', 'optOutIcon']),
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
