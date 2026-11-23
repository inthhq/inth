import { createElement } from './create-element';

/**
 * Status pill with a visually hidden prefix, so a row reads
 * "Effective: Allowed" to screen readers but shows "Allowed".
 */
// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createState(
	document: Document,
	prefix: string,
	value: string,
	state: string
): HTMLElement {
	const pill = createElement(document, 'span', 'inth-dev-tools__state');
	pill.dataset.state = state;
	pill.append(
		createElement(document, 'span', 'inth-dev-tools__sr-only', `${prefix}: `),
		createElement(document, 'span', undefined, value)
	);
	return pill;
}
