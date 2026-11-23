/**
 * The "Consent by" tag for the browser-rendered banners.
 */

import { brandMarkSvg } from '@inth/sdk/ui/utils/branding';

import { resolveBrandingModel } from '../banner/branding.model';
import type { BrandingModelInput } from '../banner/branding.model';
import { createElement } from './create-element';

/**
 * Build the "Consent by" tag `branding.astro` renders.
 *
 * @param input - The snapshot's brand and the banner's options.
 * @param securedBy - "Consent by", already translated.
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
		wordmark = createElement('span', { class: classes.wordmark, dir: 'ltr' });
		wordmark.innerHTML = brandMarkSvg('inth');
	} else {
		const mark = createElement('span', { class: classes.mark });
		mark.innerHTML = brandMarkSvg('c15t');
		wordmark = createElement('span', { class: classes.wordmark, dir: 'ltr' }, [
			mark,
			createElement('span', { class: classes.label }, ['c15t']),
		]);
	}
	return createElement(
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
			createElement(
				'span',
				{ class: classes.content, 'data-slot': 'tag-content' },
				[
					createElement('span', { class: classes.copy }, [
						createElement('span', { class: classes.text }, [securedBy]),
					]),
					wordmark,
				]
			),
		]
	);
};
