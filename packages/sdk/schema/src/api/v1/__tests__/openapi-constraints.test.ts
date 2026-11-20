/**
 * The patterns and limits the generated types cannot show, read from the
 * backend's OpenAPI document and compared with the SDK's.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	V1_DOCUMENT_TYPE_PATTERN,
	V1_MAX_ACCEPTANCES,
	V1_PROPERTY_MAX_LENGTH,
	V1_PROPERTY_PATTERN,
} from '../constants';

interface Node {
	items?: Node;
	maxItems?: number;
	maxLength?: number;
	minItems?: number;
	minLength?: number;
	pattern?: string;
	properties?: Record<string, Node>;
}

const document = JSON.parse(
	readFileSync(
		new URL('../../../../vendor/backend-openapi/openapi.json', import.meta.url),
		'utf8'
	)
) as { components: { schemas: Record<string, Node> } };

/** The node at `path` below a component, where `[]` steps into items. */
const at = function at(component: string, ...path: string[]): Node {
	let node = document.components.schemas[component];
	for (const key of path) {
		node = key === '[]' ? node?.items : node?.properties?.[key];
	}
	if (!node) {
		throw new Error(`No ${[component, ...path].join('.')} in the document`);
	}
	return node;
};

describe('the backend document and the SDK agree on', () => {
	it.each([
		['ConsentRecordRequest', 'property'],
		['ConsentSessionRequest', 'journey', 'property'],
		['DocumentAcceptancesRequest', 'property'],
	])('the property rule in %s', (component, ...path) => {
		const { maxLength, minLength, pattern } = at(component, ...path);
		expect({ maxLength, minLength, pattern }).toEqual({
			maxLength: V1_PROPERTY_MAX_LENGTH,
			minLength: 1,
			pattern: V1_PROPERTY_PATTERN.source,
		});
	});

	it('the number of acceptances', () => {
		expect(at('DocumentAcceptancesRequest', 'acceptances')).toMatchObject({
			maxItems: V1_MAX_ACCEPTANCES,
			minItems: 1,
		});
	});

	it('the document type pattern', () => {
		expect(
			at('DocumentAcceptancesRequest', 'acceptances', '[]', 'type').pattern
		).toBe(V1_DOCUMENT_TYPE_PATTERN.source);
	});

	it.each([
		'ConsentRecordRequest',
		'DocumentAcceptancesRequest',
		'SubjectLinkRequest',
	])('a non-empty identity provider in %s', (component) => {
		expect(at(component, 'identityProvider').minLength).toBe(1);
	});
});
