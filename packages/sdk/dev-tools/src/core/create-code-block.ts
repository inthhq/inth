import { createElement } from './create-element';
import { serializeDiagnostic } from './serialize-diagnostic';

// oxlint-disable-next-line func-style -- Hoisted DOM helpers keep render functions readable.
export function createCodeBlock(
	document: Document,
	value: unknown
): HTMLElement {
	const output = createElement(document, 'pre', 'inth-dev-tools__code');
	output.textContent = serializeDiagnostic(value);
	return output;
}
