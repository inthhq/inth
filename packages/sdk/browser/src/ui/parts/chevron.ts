import { icon } from './el';

/** A chevron, pointing down or toward the end. */
export const chevron = (
	direction: 'down' | 'end' = 'down',
	size = 14
): SVGSVGElement =>
	icon(size, [direction === 'down' ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6']);
