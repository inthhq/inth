import { CPPA_OPT_OUT_ICON } from '@inth/sdk-ui/utils/opt-out-icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build the official California CCPA opt-out icon as a decorative SVG.
 *
 * Always rendered next to visible "Your Privacy Choices" or
 * "Your California Privacy Choices" text, so it sets `aria-hidden="true"`
 * and `focusable="false"`. Path colors stay fixed across light and dark
 * themes.
 */
export const createOptOutIcon = function createOptOutIcon(
	className?: string
): SVGSVGElement {
	const element = document.createElementNS(SVG_NS, 'svg');
	element.setAttribute('viewBox', CPPA_OPT_OUT_ICON.viewBox);
	element.setAttribute('aria-hidden', 'true');
	element.setAttribute('focusable', 'false');
	if (className) {
		element.setAttribute('class', className);
	}
	for (const path of CPPA_OPT_OUT_ICON.paths) {
		const node = document.createElementNS(SVG_NS, 'path');
		node.setAttribute('fill', path.fill);
		node.setAttribute('d', path.d);
		if (path.evenOdd) {
			node.setAttribute('fill-rule', 'evenodd');
			node.setAttribute('clip-rule', 'evenodd');
		}
		element.append(node);
	}
	return element;
};
