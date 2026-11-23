import { icon } from './el';

/** A check mark. */
export const checkIcon = (size = 14): SVGSVGElement =>
	icon(size, ['M20 6 9 17l-5-5'], { strokeWidth: '2.5' });
