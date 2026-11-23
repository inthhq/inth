import { createElement } from './create-element';

// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createButton(
	document: Document,
	label: string,
	onClick: () => void,
	variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary'
): HTMLButtonElement {
	const button = createElement(
		document,
		'button',
		`inth-dev-tools__button inth-dev-tools__button--${variant}`,
		label
	);
	button.type = 'button';
	button.dataset.focusKey = `button:${label}`;
	button.addEventListener('click', onClick);
	return button;
}
