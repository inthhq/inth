import { transform } from 'esbuild';
import * as valibot from 'valibot';
import { describe, expect, it } from 'vitest';

import * as runtime from '../packages/sdk/schema/src/api/v1/json-schema';
import { openApiToValibot } from './openapi-to-valibot';
import type { OpenApiDocument } from './openapi-to-valibot';

const OPTIONS = {
	header: '',
	runtimeModule: '../json-schema',
	typesModule: './types',
};

const withComponents = (schemas: Record<string, unknown>): OpenApiDocument => ({
	components: { schemas: schemas as Record<string, Record<string, unknown>> },
	openapi: '3.1.0',
});

const withComponent = (schema: unknown) => withComponents({ Thing: schema });

const withOperation = (operation: unknown): OpenApiDocument => ({
	openapi: '3.1.0',
	paths: { '/v1/things': { get: operation } },
});

const convert = (document: OpenApiDocument) =>
	openApiToValibot(document, OPTIONS);

type Schemas = Record<string, valibot.GenericSchema>;

/** The generated module, compiled and run. */
const load = async function load(document: OpenApiDocument): Promise<Schemas> {
	const { code } = await transform(convert(document), {
		format: 'cjs',
		loader: 'ts',
	});
	const module = { exports: {} as Schemas };
	const modules: Record<string, unknown> = {
		[OPTIONS.runtimeModule]: runtime,
		valibot,
	};
	const require = (id: string) => {
		if (!(id in modules)) {
			throw new Error(`Unexpected import ${id}`);
		}
		return modules[id];
	};
	// oxlint-disable-next-line no-new-func -- Runs the generated module, as a bundler would
	new Function('require', 'module', 'exports', code)(
		require,
		module,
		module.exports
	);
	return module.exports;
};

/** The schema generated for one component named `Thing`. */
const thing = async (schema: unknown) =>
	(await load(withComponent(schema))).thingSchema as valibot.GenericSchema;

const accepts = (schema: valibot.GenericSchema, value: unknown) =>
	valibot.is(schema, value);

describe('openApiToValibot checks what the document says', () => {
	it('refuses an array where an object or record is', async () => {
		const object = await thing({
			properties: { a: { type: 'string' } },
			type: 'object',
		});
		const record = await thing({
			additionalProperties: { type: 'string' },
			type: 'object',
		});
		for (const schema of [object, record]) {
			expect(accepts(schema, {})).toBe(true);
			expect(accepts(schema, Object.create(null))).toBe(true);
			expect(accepts(schema, [])).toBe(false);
			expect(accepts(schema, new Date(0))).toBe(false);
			expect(accepts(schema, new Map())).toBe(false);
			expect(accepts(schema, Object.create({ a: 'x' }))).toBe(false);
		}
	});

	it('refuses a key a strict object leaves out, even one an object inherits', async () => {
		const strict = await thing({
			additionalProperties: false,
			properties: { a: { type: 'string' } },
			type: 'object',
		});
		expect(accepts(strict, { a: 'x' })).toBe(true);
		for (const json of [
			'{"toString":1}',
			'{"constructor":1}',
			'{"__proto__":1}',
			'{"valueOf":[]}',
		]) {
			expect(accepts(strict, JSON.parse(json))).toBe(false);
		}
	});

	it('checks the record keys v.record passes over', async () => {
		const record = await thing({
			additionalProperties: { type: 'boolean' },
			type: 'object',
		});
		expect(accepts(record, JSON.parse('{"constructor":true}'))).toBe(true);
		expect(accepts(record, JSON.parse('{"constructor":"yes"}'))).toBe(false);
		expect(accepts(record, JSON.parse('{"__proto__":"yes"}'))).toBe(false);
	});

	it('checks record keys against propertyNames', async () => {
		const record = await thing({
			additionalProperties: { type: 'boolean' },
			propertyNames: { pattern: '^[a-z]+$', type: 'string' },
			type: 'object',
		});
		expect(accepts(record, { abc: true })).toBe(true);
		expect(accepts(record, { ABC: true })).toBe(false);
	});

	it('keeps unknown keys with additionalProperties: true', async () => {
		const object = await thing({
			additionalProperties: true,
			properties: { a: { type: 'string' } },
			type: 'object',
		});
		expect(valibot.parse(object, { a: 'x', b: 1 })).toEqual({ a: 'x', b: 1 });
	});

	it('refuses an unknown key with additionalProperties: false', async () => {
		const object = await thing({
			additionalProperties: false,
			properties: { a: { type: 'string' } },
			type: 'object',
		});
		expect(accepts(object, { a: 'x', b: 1 })).toBe(false);
	});

	it('counts string lengths in code points', async () => {
		const short = await thing({ maxLength: 2, minLength: 2, type: 'string' });
		expect(accepts(short, '😀😀')).toBe(true);
		expect(accepts(short, '😀')).toBe(false);
		expect(accepts(short, 'abc')).toBe(false);
	});

	it('applies a pattern with the u flag', async () => {
		const one = await thing({ pattern: '^.$', type: 'string' });
		expect(accepts(one, '😀')).toBe(true);
	});

	it('writes an empty pattern and a line break as valid source', async () => {
		const empty = await thing({ pattern: '', type: 'string' });
		const lines = await thing({ pattern: '^a\nb$', type: 'string' });
		expect(accepts(empty, 'anything')).toBe(true);
		expect(accepts(lines, 'a\nb')).toBe(true);
		expect(accepts(lines, 'ab')).toBe(false);
		const separator = await thing({ pattern: '^a\u2028b$', type: 'string' });
		expect(accepts(separator, 'a\u2028b')).toBe(true);
	});

	it('checks formats with the runtime helpers', async () => {
		const time = await thing({ format: 'date-time', type: 'string' });
		const uri = await thing({ format: 'uri', type: 'string' });
		const id = await thing({ format: 'uuid', type: 'string' });
		expect(accepts(time, '2024-02-29T12:00:00Z')).toBe(true);
		expect(accepts(time, '2024-02-30T12:00:00Z')).toBe(false);
		expect(accepts(uri, 'https://example.com/a')).toBe(true);
		expect(accepts(uri, 'https://example.com/#a#b')).toBe(false);
		expect(accepts(id, '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e')).toBe(true);
		expect(accepts(id, 'key-1')).toBe(false);
	});

	it('refuses a number JSON cannot hold', async () => {
		const number = await thing({ type: 'number' });
		expect(accepts(number, 1.5)).toBe(true);
		expect(accepts(number, Number.POSITIVE_INFINITY)).toBe(false);
	});

	it('takes a null const and a null in an enum', async () => {
		const none = await thing({ const: null });
		const maybe = await thing({ enum: ['a', null] });
		expect(accepts(none, null)).toBe(true);
		expect(accepts(maybe, null)).toBe(true);
		expect(accepts(maybe, 'a')).toBe(true);
		expect(accepts(maybe, 'b')).toBe(false);
	});

	it('picks a oneOf branch by the key that tells the branches apart', async () => {
		const either = await thing({
			oneOf: [
				{
					properties: { kind: { const: 'a' }, value: { type: 'string' } },
					required: ['kind'],
					type: 'object',
				},
				{
					properties: { kind: { const: 'b' }, value: { type: 'number' } },
					required: ['kind'],
					type: 'object',
				},
			],
		});
		expect(accepts(either, { kind: 'a', value: 'x' })).toBe(true);
		expect(accepts(either, { kind: 'a', value: 1 })).toBe(false);
		expect(accepts(either, Object.assign([], { kind: 'a' }))).toBe(false);
		expect(accepts(either, new Date(0))).toBe(false);
	});

	it('refuses an array or an undeclared key in a strict branch of a variant', async () => {
		const either = await thing({
			oneOf: [
				{
					additionalProperties: false,
					properties: { '0': { const: 'a' } },
					required: ['0'],
					type: 'object',
				},
				{
					additionalProperties: false,
					properties: { '0': { const: 'b' } },
					required: ['0'],
					type: 'object',
				},
			],
		});
		expect(accepts(either, { '0': 'a' })).toBe(true);
		expect(accepts(either, ['a'])).toBe(false);
		expect(accepts(either, JSON.parse('{"0":"a","toString":1}'))).toBe(false);
	});

	it('applies exclusive bounds, and keeps the title and examples', async () => {
		const between = await thing({
			examples: [1],
			exclusiveMaximum: 2,
			exclusiveMinimum: 0,
			title: 'Between',
			type: 'number',
		});
		expect(accepts(between, 1)).toBe(true);
		expect(accepts(between, 0)).toBe(false);
		expect(accepts(between, 2)).toBe(false);
		expect(valibot.getTitle(between)).toBe('Between');
		expect(valibot.getExamples(between)).toEqual([1]);
	});

	it('declares two components that refer to each other', async () => {
		const schemas = await load(
			withComponents({
				A: {
					properties: { b: { $ref: '#/components/schemas/B' } },
					type: 'object',
				},
				B: {
					properties: { a: { $ref: '#/components/schemas/A' } },
					type: 'object',
				},
			})
		);
		const a = schemas.aSchema as valibot.GenericSchema;
		expect(accepts(a, { b: { a: { b: {} } } })).toBe(true);
		expect(accepts(a, { b: { a: [] } })).toBe(false);
	});

	it('merges path-level parameters with the operation’s own', async () => {
		const schemas = await load({
			openapi: '3.1.0',
			paths: {
				'/v1/things/{id}': {
					get: {
						operationId: 'getThing',
						parameters: [
							{
								in: 'query',
								name: 'q',
								schema: { enum: ['x'], type: 'string' },
							},
						],
						responses: {},
					},
					parameters: [
						{
							in: 'path',
							name: 'id',
							required: true,
							schema: { type: 'string' },
						},
						{ in: 'query', name: 'q', schema: { type: 'string' } },
					],
				},
			},
		});
		const path = schemas.getThingPathSchema as valibot.GenericSchema;
		const query = schemas.getThingQuerySchema as valibot.GenericSchema;
		expect(accepts(path, { id: '1' })).toBe(true);
		expect(accepts(query, { q: 'x' })).toBe(true);
		expect(accepts(query, { q: 'y' })).toBe(false);
	});

	it('describes a $ref parameter without adding a sibling to the $ref', () => {
		const document: OpenApiDocument = {
			components: { schemas: { Id: { type: 'string' } } },
			openapi: '3.1.0',
			paths: {
				'/v1/things': {
					get: {
						operationId: 'getThings',
						parameters: [
							{
								description: 'The ID',
								in: 'query',
								name: 'id',
								schema: { $ref: '#/components/schemas/Id' },
							},
						],
						responses: {},
					},
				},
			},
		};
		expect(convert(document)).toContain('v.optional(idSchema)');
	});
});

describe('openApiToValibot refuses', () => {
	it.each([
		[
			'a keyword it does not know',
			{ contentEncoding: 'base64', type: 'string' },
			'unsupported keyword "contentEncoding"',
		],
		[
			'a format it does not know',
			{ format: 'email', type: 'string' },
			'unsupported format "email"',
		],
		[
			'a keyword on the wrong type',
			{ minLength: 1, type: 'number' },
			'"minLength" on type number',
		],
		[
			'a keyword without a type',
			{ properties: { a: { type: 'string' } } },
			'"properties" on a schema without a type',
		],
		['a list of types', { type: ['string', 'null'] }, 'a list of types'],
		[
			'a list of types beside an enum',
			{ enum: ['a'], type: ['string', 'null'] },
			'a list of types',
		],
		[
			'a $ref with siblings',
			{ $ref: '#/components/schemas/Thing', description: 'x' },
			'$ref with sibling keywords',
		],
		[
			'a $ref outside the components',
			{ $ref: 'other.json#/Thing' },
			'is not a component schema',
		],
		[
			'a check beside an enum',
			{ enum: ['a'], pattern: 'a', type: 'string' },
			'"pattern" beside "enum"',
		],
		[
			'an enum value of another type',
			{ enum: ['a', 1], type: 'string' },
			'a enum value that is not of type string',
		],
		[
			'a const of another type',
			{ const: 'a', type: 'number' },
			'a const value that is not of type number',
		],
		['an object const', { const: { a: 1 } }, 'an object or array value'],
		['an array in an enum', { enum: [[1]] }, 'an object or array value'],
		[
			'a type beside anyOf',
			{ anyOf: [{ type: 'string' }], type: 'string' },
			'"type" beside "oneOf" or "anyOf"',
		],
		['an empty anyOf', { anyOf: [] }, 'an empty list of schemas'],
		[
			'allOf',
			{ allOf: [{ type: 'object' }, { type: 'object' }] },
			'allOf; v.intersect merges',
		],
		[
			'a required name an object inherits',
			{ properties: {}, required: ['toString'], type: 'object' },
			'"toString" is required but has no schema',
		],
		[
			'a type an object inherits',
			{ type: 'constructor' },
			'unsupported type constructor',
		],
		[
			'a format an object inherits',
			{ format: 'constructor', type: 'string' },
			'unsupported format "constructor"',
		],
		[
			'a $ref to a component an object inherits',
			{ $ref: '#/components/schemas/toString' },
			'$ref to missing toString',
		],
		[
			'a oneOf whose branches may overlap',
			{ oneOf: [{ type: 'number' }, { type: 'integer' }] },
			'a value could match more than one',
		],
		[
			'a oneOf whose null branch another may match',
			{ oneOf: [{ type: 'null' }, {}] },
			'null branch another branch may match too',
		],
		[
			'items that is not a schema',
			{ items: false, type: 'array' },
			'items that is not a schema',
		],
		[
			'propertyNames that is not a schema',
			{
				additionalProperties: { type: 'string' },
				propertyNames: false,
				type: 'object',
			},
			'propertyNames that is not a schema',
		],
		[
			'a pattern that does not compile',
			{ pattern: '(', type: 'string' },
			'pattern does not compile',
		],
		[
			'a required key without a schema',
			{ properties: {}, required: ['id'], type: 'object' },
			'"id" is required but has no schema',
		],
		[
			'required that is not a list',
			{ properties: {}, required: 'id', type: 'object' },
			'required is not a list of names',
		],
		[
			'a default on a required property',
			{
				properties: { a: { default: true, type: 'boolean' } },
				required: ['a'],
				type: 'object',
			},
			'"default" on a required property',
		],
		[
			'propertyNames beside properties',
			{
				additionalProperties: { type: 'string' },
				properties: { a: { type: 'string' } },
				propertyNames: { type: 'string' },
				type: 'object',
			},
			'"propertyNames" is only supported on a record',
		],
		[
			'a oneOf with two null branches',
			{ oneOf: [{ type: 'null' }, { type: 'null' }, { type: 'string' }] },
			'two null branches',
		],
		[
			'properties beside an additionalProperties schema',
			{
				additionalProperties: { type: 'number' },
				properties: { a: { type: 'string' } },
				type: 'object',
			},
			'properties beside an additionalProperties schema',
		],
		[
			'a property named after an Object.prototype member',
			{ properties: { toString: { type: 'string' } }, type: 'object' },
			'a property named after an Object.prototype member',
		],
		[
			'a property named __proto__',
			{
				properties: JSON.parse('{"__proto__":{"type":"string"}}'),
				type: 'object',
			},
			'a property named after an Object.prototype member',
		],
		[
			'a default beside a check',
			{
				properties: { a: { default: '', minLength: 1, type: 'string' } },
				type: 'object',
			},
			'"default" beside anything but',
		],
		[
			'a default of another type',
			{ properties: { a: { default: 1, type: 'string' } }, type: 'object' },
			'"default" beside anything but',
		],
		[
			'a format that is not a string',
			{ format: 123, type: 'string' },
			'"format" is not a string',
		],
		[
			'a pattern that is not a string',
			{ pattern: 456, type: 'string' },
			'"pattern" is not a string',
		],
	])('%s', (_name, schema, message) => {
		expect(() => convert(withComponent(schema))).toThrow(message);
	});

	it('a component name that is not a JavaScript name', () => {
		expect(() =>
			convert(withComponents({ 'Thing-Two': { type: 'string' } }))
		).toThrow('is not a valid name');
	});

	it('two schemas with one name', () => {
		const document: OpenApiDocument = {
			components: { schemas: { GetThingsQuery: { type: 'string' } } },
			openapi: '3.1.0',
			paths: {
				'/v1/things': {
					get: {
						operationId: 'getThings',
						parameters: [
							{ in: 'query', name: 'q', schema: { type: 'string' } },
						],
						responses: {},
					},
				},
			},
		};
		expect(() => convert(document)).toThrow(
			'two schemas named getThingsQuerySchema'
		);
	});

	const json = { 'application/json': { schema: { type: 'string' } } };

	it.each([
		[
			'an operation without an operationId',
			{ responses: {} },
			'operation without operationId',
		],
		[
			'an operationId that is not a JavaScript name',
			{ operationId: 'get-things', responses: {} },
			'is not a valid name',
		],
		[
			'a header parameter',
			{
				operationId: 'getThings',
				parameters: [{ in: 'header', name: 'x-a', schema: { type: 'string' } }],
				responses: {},
			},
			'unsupported location "header"',
		],
		[
			'a parameter $ref',
			{
				operationId: 'getThings',
				parameters: [{ $ref: '#/components/parameters/Q' }],
				responses: {},
			},
			'only inline parameters are supported',
		],
		[
			'a parameter that is not a string',
			{
				operationId: 'getThings',
				parameters: [
					{ in: 'query', name: 'limit', schema: { type: 'integer' } },
				],
				responses: {},
			},
			'a parameter that is not a string',
		],
		[
			'an optional request body',
			{
				operationId: 'getThings',
				requestBody: { content: json },
				responses: {},
			},
			'an optional request body',
		],
		[
			'a request body $ref',
			{
				operationId: 'getThings',
				requestBody: { $ref: '#/components/requestBodies/B' },
				responses: {},
			},
			'only inline responses and bodies are supported',
		],
		[
			'a body that is not JSON',
			{
				operationId: 'getThings',
				requestBody: {
					content: { 'text/plain': { schema: { type: 'string' } } },
					required: true,
				},
				responses: {},
			},
			'unsupported media types text/plain',
		],
		[
			'two JSON success bodies',
			{
				operationId: 'getThings',
				responses: { 200: { content: json }, 201: { content: json } },
			},
			'JSON bodies for 200 and 201',
		],
		[
			'a response $ref',
			{
				operationId: 'getThings',
				responses: { 200: { $ref: '#/components/responses/Ok' } },
			},
			'only inline responses and bodies are supported',
		],
		[
			'a 2XX status',
			{ operationId: 'getThings', responses: { '2XX': { content: json } } },
			'unsupported status',
		],
	])('%s', (_name, operation, message) => {
		expect(() => convert(withOperation(operation))).toThrow(message);
	});

	it('an OpenAPI 3.0 document', () => {
		expect(() => convert({ openapi: '3.0.3' })).toThrow('only 3.1 documents');
	});
});
