import type { ConsentSnapshot } from '@inth/sdk-core';
import {
	BRAND_MARKS,
	resolveBrandingTag,
	resolveBrandMark,
} from '@inth/sdk-ui/utils/branding';
import type { BrandingSurface, BrandMark } from '@inth/sdk-ui/utils/branding';

import { classes } from '../generated/styles';
import { h, svg } from './h';

/** What {@link renderBranding} needs. */
export interface BrandingParams {
	/** The brand the transport resolved. */
	branding: ConsentSnapshot['branding'];
	/** The surface the tag sits on. */
	surface: BrandingSurface;
	/** "Consent by", already translated. */
	securedBy: string;
	/** Drop the tag. */
	hide: boolean;
	/** Ship the DOM without class names. */
	noStyle: boolean;
}

const drawMark = function drawMark(mark: BrandMark): SVGSVGElement {
	const glyph = BRAND_MARKS[mark];
	const element = svg(glyph.viewBox, [], { fill: 'none' });
	for (const path of glyph.paths) {
		const node = document.createElementNS(element.namespaceURI, 'path');
		node.setAttribute('fill', 'currentColor');
		node.setAttribute('d', path.d);
		if (path.evenOdd) {
			node.setAttribute('fill-rule', 'evenodd');
			node.setAttribute('clip-rule', 'evenodd');
		}
		element.append(node);
	}
	return element;
};

/**
 * The brand's compact mark, as on the other SDKs' triggers.
 *
 * @returns A decorative, `currentColor` SVG.
 */
export const createBrandMark = function createBrandMark(
	value: ConsentSnapshot['branding']
): SVGSVGElement {
	return drawMark(resolveBrandMark(value));
};

/**
 * Render the "Consent by" tag, or nothing.
 *
 * @returns The anchor, or `null` when hidden.
 */
export const renderBranding = function renderBranding(
	params: BrandingParams
): HTMLElement | null {
	const tag = params.hide
		? null
		: resolveBrandingTag({
				branding: params.branding,
				hostname:
					typeof window === 'undefined' ? undefined : window.location.hostname,
				noStyle: params.noStyle,
				styles: classes.branding,
				surface: params.surface,
			});
	if (!tag) {
		return null;
	}
	const wordmark =
		tag.brand === 'inth'
			? h('span', { class: tag.classes.wordmark, dir: 'ltr' }, drawMark('inth'))
			: h(
					'span',
					{ class: tag.classes.wordmark, dir: 'ltr' },
					h('span', { class: tag.classes.mark }, drawMark('c15t')),
					h('span', { class: tag.classes.label }, 'c15t')
				);

	return h(
		'a',
		{
			class: tag.classes.root,
			'data-branding': tag.brand,
			'data-testid': tag.testId,
			'data-variant': tag.variant,
			href: tag.href,
		},
		h(
			'span',
			{ class: tag.classes.content, 'data-slot': 'tag-content' },
			h(
				'span',
				{ class: tag.classes.copy },
				h('span', { class: tag.classes.text }, params.securedBy)
			),
			wordmark
		)
	);
};
