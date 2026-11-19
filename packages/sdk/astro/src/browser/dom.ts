/**
 * DOM helpers shared by the browser-rendered banners.
 */

import { brandMarkSvg } from '@inth/sdk/ui/utils/branding';

import { resolveBrandingModel } from '../banner/branding-model';
import type { BrandingModelInput } from '../banner/branding-model';

type Attributes = Record<string, string | undefined>;

/**
 * Create an element, skipping undefined attributes.
 */
export const element = function element(
	tag: string,
	attributes: Attributes,
	children: (Node | string)[] = []
): HTMLElement {
	const node = document.createElement(tag);
	for (const [name, value] of Object.entries(attributes)) {
		if (value !== undefined) {
			node.setAttribute(name, value);
		}
	}
	node.append(...children);
	return node;
};

/**
 * Read the JSON a banner component left in its spot.
 *
 * @param spot - The placeholder element.
 * @param attribute - The attribute carrying the JSON.
 * @returns The parsed value, or `null` when it is missing or malformed.
 */
export const readSpot = function readSpot(
	spot: HTMLElement,
	attribute: string
): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(spot.getAttribute(attribute) ?? '');
		return parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
};

/**
 * Build the "Secured by" tag `branding.astro` renders.
 *
 * @param input - The snapshot's brand and the banner's options.
 * @param securedBy - "Secured by", already translated.
 * @returns The tag, or `null` when branding is hidden.
 */
export const renderBrandingTag = function renderBrandingTag(
	input: Omit<BrandingModelInput, 'hostname'>,
	securedBy: string
): HTMLElement | null {
	const tag = resolveBrandingModel({
		...input,
		hostname: window.location.hostname,
	});
	if (!tag) {
		return null;
	}
	const { classes } = tag;
	let wordmark: HTMLElement;
	if (tag.brand === 'inth') {
		wordmark = element('span', { class: classes.wordmark, dir: 'ltr' });
		wordmark.innerHTML = brandMarkSvg('inth');
	} else {
		const mark = element('span', { class: classes.mark });
		mark.innerHTML = brandMarkSvg('c15t');
		wordmark = element('span', { class: classes.wordmark, dir: 'ltr' }, [
			mark,
			element('span', { class: classes.label }, ['c15t']),
		]);
	}
	return element(
		'a',
		{
			class: tag.root.class,
			'data-branding': tag.brand,
			'data-testid': tag.testId,
			'data-variant': tag.variant,
			href: tag.href,
			style: tag.root.style,
		},
		[
			element('span', { class: classes.content, 'data-slot': 'tag-content' }, [
				element('span', { class: classes.copy }, [
					element('span', { class: classes.text }, [securedBy]),
				]),
				wordmark,
			]),
		]
	);
};

/**
 * Hide a freshly built banner until `syncBannerVisibility` decides, the
 * same as a prerendered server banner, with its overlay in front of it.
 *
 * @param overlay - The backdrop, for blocking banners.
 * @returns The nodes to insert, in document order.
 */
export const hiddenBanner = function hiddenBanner(
	root: HTMLElement,
	overlay: HTMLElement | null
): HTMLElement[] {
	root.hidden = true;
	root.setAttribute('data-inth-visible', 'false');
	if (!overlay) {
		return [root];
	}
	overlay.hidden = true;
	return [overlay, root];
};
