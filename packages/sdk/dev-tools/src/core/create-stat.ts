import { createElement } from './create-element';

// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createStat(
	document: Document,
	label: string,
	value: string
): HTMLElement {
	const row = createElement(document, 'div', 'inth-dev-tools__stat');
	row.append(
		createElement(document, 'dt', undefined, label),
		createElement(document, 'dd', undefined, value)
	);
	return row;
}
