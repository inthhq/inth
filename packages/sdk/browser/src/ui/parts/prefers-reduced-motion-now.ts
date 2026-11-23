/** Whether the visitor asked for reduced motion. */
export const prefersReducedMotionNow = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;
