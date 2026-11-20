import { describe, expect, it } from 'vitest';

import {
	checkV1OpenApiTypes,
	hoistNestedDefs,
} from './generate-v1-openapi-types';

const INIT_SCHEMA = [
	'paths',
	'/v1/consent/init',
	'get',
	'responses',
	'200',
	'content',
	'application/json',
	'schema',
];

const documentWith = (schema: Record<string, unknown>) => {
	const document: Record<string, unknown> = {};
	let node = document;
	for (const key of INIT_SCHEMA.slice(0, -1)) {
		const next: Record<string, unknown> = {};
		node[key] = next;
		node = next;
	}
	node.schema = schema;
	return document;
};

describe('generate-v1-openapi-types', () => {
	it('matches the committed types', async () => {
		expect(
			await checkV1OpenApiTypes(),
			'Run `pnpm --dir scripts generate:v1-openapi-types`'
		).toBe(true);
	});

	it('moves the listed $defs to components and follows their references', () => {
		const hoisted = hoistNestedDefs(
			documentWith({
				$defs: { '0': { anyOf: [{ type: 'string' }, { $ref: '#/$defs/0' }] } },
				properties: { category: { $ref: '#/$defs/0' } },
			})
		);
		expect(hoisted).toMatchObject({
			components: {
				schemas: {
					V1CategoryCondition: {
						anyOf: [
							{ type: 'string' },
							{ $ref: '#/components/schemas/V1CategoryCondition' },
						],
					},
				},
			},
			paths: {
				'/v1/consent/init': {
					get: {
						responses: {
							200: {
								content: {
									'application/json': {
										schema: {
											properties: {
												category: {
													$ref: '#/components/schemas/V1CategoryCondition',
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		});
	});

	it('refuses $defs it does not list, and an entry the document no longer needs', () => {
		expect(() =>
			hoistNestedDefs({
				...documentWith({ properties: {} }),
				components: { schemas: { Other: { $defs: { a: {} } } } },
			})
		).toThrow(/Unlisted \$defs/u);
		expect(() => hoistNestedDefs(documentWith({ properties: {} }))).toThrow(
			/remove the entry/u
		);
	});
});
