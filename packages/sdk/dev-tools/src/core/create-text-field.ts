import { createElement } from './create-element';

// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createTextField(
	document: Document,
	labelText: string,
	value: string
): { field: HTMLElement; input: HTMLInputElement } {
	const field = createElement(document, 'label', 'inth-dev-tools__field');
	field.append(createElement(document, 'span', undefined, labelText));
	const input = createElement(document, 'input');
	input.type = 'text';
	input.value = value;
	input.autocomplete = 'off';
	input.spellcheck = false;
	input.dataset.focusKey = `field:${labelText}`;
	field.append(input);
	return { field, input };
}
