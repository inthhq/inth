/**
 * The visitor's `prefers-reduced-motion` setting, which surfaces use as
 * the default for `disableAnimation`.
 *
 * Where `matchMedia` is missing, as on the server, in jsdom and in a few
 * embedded webviews, motion is not reduced.
 *
 * @packageDocumentation
 */

const QUERY = '(prefers-reduced-motion: reduce)';

const query = (): MediaQueryList | undefined =>
	typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia(QUERY)
		: undefined;

/** Whether the visitor asked for reduced motion. */
export const prefersReducedMotion = function prefersReducedMotion(): boolean {
	return query()?.matches ?? false;
};

/**
 * Calls `onChange` when the visitor's reduced motion setting changes.
 *
 * @returns A function that stops listening.
 */
export const subscribeReducedMotion = function subscribeReducedMotion(
	onChange: (reduced: boolean) => void
): () => void {
	const list = query();
	if (!list) {
		return () => undefined;
	}
	const listener = (event: { matches: boolean }) => onChange(event.matches);
	list.addEventListener('change', listener);
	return () => list.removeEventListener('change', listener);
};
