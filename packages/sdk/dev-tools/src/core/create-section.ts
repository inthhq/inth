import { createElement } from './create-element';

// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createSection(
	document: Document,
	title: string,
	description?: string,
	action?: HTMLElement
): HTMLElement {
	const section = createElement(document, 'section', 'inth-dev-tools__section');
	// Title and description sit closer to each other than to the content.
	const heading = createElement(
		document,
		'div',
		'inth-dev-tools__section-heading'
	);
	heading.append(createElement(document, 'h3', undefined, title));
	if (description) {
		heading.append(
			createElement(document, 'p', 'inth-dev-tools__muted', description)
		);
	}
	if (action) {
		const header = createElement(
			document,
			'div',
			'inth-dev-tools__section-header'
		);
		header.append(heading, action);
		section.append(header);
	} else {
		section.append(heading);
	}
	return section;
}
