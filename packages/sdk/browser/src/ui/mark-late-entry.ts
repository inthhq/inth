import { isLateEntry } from '@inth/sdk-ui/utils/late-entry';

/**
 * Read a CSS duration custom property from an element, in milliseconds.
 *
 * @param fallback - Used when the property is unset or unparsable.
 */
export const readDurationMs = function readDurationMs(
	element: Element,
	name: string,
	fallback: number
): number {
	const value = getComputedStyle(element).getPropertyValue(name).trim();
	if (!value) {
		return fallback;
	}
	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed)) {
		return fallback;
	}
	return value.endsWith('ms') ? parsed : parsed * 1000;
};

/**
 * Whether the browser applies `@starting-style`.
 *
 * With it, a surface inserted in its visible state transitions in from the
 * stylesheet's entering state on the first frame. Without it, the mount
 * has to insert the hidden state, force a layout and flip the classes.
 */
export const supportsStartingStyle = function supportsStartingStyle(): boolean {
	return 'CSSStartingStyleRule' in globalThis;
};

/**
 * Mark a mount that arrives after the page has painted, so the stylesheet
 * fades it in rather than popping it into a page someone is already reading.
 *
 * @param elements - The banner root and its backdrop, when it has one.
 * @returns Whether the mount was marked late.
 */
export const markLateEntry = function markLateEntry(
	elements: readonly (HTMLElement | null)[]
): boolean {
	if (!isLateEntry()) {
		return false;
	}
	for (const element of elements) {
		element?.setAttribute('data-entry', 'late');
	}
	return true;
};
