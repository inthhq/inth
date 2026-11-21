import { runInNewContext } from 'node:vm';

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
	characters,
	isDateTime,
	isPlainObject,
	isUri,
	jsonObject,
	jsonRecord,
	jsonVariant,
} from '../json-schema';

describe('isPlainObject', () => {
	it.each([
		['an object literal', {}, true],
		['an object without a prototype', Object.create(null), true],
		['parsed JSON', JSON.parse('{"__proto__":1}'), true],
		['an object from another realm', runInNewContext('({ a: 1 })'), true],
		['an array from another realm', runInNewContext('[]'), false],
		[
			'an object whose prototype is a null-rooted object',
			Object.create(Object.assign(Object.create(null), { categories: {} })),
			false,
		],
		[
			'an object whose null-rooted prototype claims Object as its constructor',
			Object.create(
				Object.assign(Object.create(null), { constructor: Object })
			),
			false,
		],
		['an array', [], false],
		['a Date', new Date(0), false],
		['a Map', new Map(), false],
		['an object with another prototype', Object.create({ a: 1 }), false],
		['null', null, false],
		['a string', 'x', false],
	])('takes %s: %s', (_label, input, plain) => {
		expect(isPlainObject(input)).toBe(plain);
	});
});

describe('characters', () => {
	it('counts code points, not UTF-16 units', () => {
		expect(characters('abc')).toBe(3);
		expect(characters('😀😀')).toBe(2);
	});
});

describe('isDateTime', () => {
	it.each([
		['2024-02-29T12:00:00Z', true],
		['2024-02-29t12:00:00.5z', true],
		['2024-02-29T12:00:00+05:30', true],
		['2016-12-31T23:59:60Z', true],
		['2016-12-31T18:59:60-05:00', true],
		['2017-01-01T00:59:60+01:00', true],
		['2015-06-30T23:59:60Z', true],
		['2026-11-18T12:00:60Z', false],
		['2026-11-18T23:59:60Z', false],
		['2016-12-31T23:59:60+01:00', false],
		['2023-02-29T12:00:00Z', false],
		['2024-02-30T12:00:00Z', false],
		['2024-04-31T12:00:00Z', false],
		['2024-02-29T12:00Z', false],
		['2024-02-29T24:00:00Z', false],
		['2024-02-29T12:00:00+0100', false],
		['2024-02-29T12:00:00+24:00', false],
		['2024-02-29 12:00:00Z', false],
		['2024-02-29', false],
	])('takes %s: %s', (value, valid) => {
		expect(isDateTime(value)).toBe(valid);
	});
});

describe('isUri', () => {
	it.each([
		['https://example.com/a%20b?q=1#top', true],
		['https://user:pw@example.com:8080/a', true],
		['https://[2001:db8::1]:443/a', true],
		['https://[v1.fe]/a', true],
		['https://[V1.fe]/a', true],
		['https://[::1]/a', true],
		['https://[::]/a', true],
		['https://[2001:db8:0:0:0:0:192.0.2.1]/a', true],
		['https://[2001:db8::1:192.0.2.1]/a', true],
		['https://[::ffff:192.0.2.1]/a', true],
		['https://[fe80::1%eth0]/a', false],
		['https://[fe80::1%25eth0]/a', false],
		['https://[1:2:3:4:5:6:7:8:9]/a', false],
		['https://[1::2::3]/a', false],
		['https://[192.0.2.1::]/a', false],
		['https://[::1:256.0.2.1]/a', false],
		['urn:isbn:0451450523', true],
		['mailto:someone@example.com', true],
		['https://example.com', true],
		['https://example.com/a%zz', false],
		['https://example.com/a b', false],
		['https://example.com/#a#b', false],
		['https://[abc', false],
		['https://[not-ip]/a', false],
		['https://example.com:port/a', false],
		['https://a@b@example.com/', false],
		['https://example.com/[bad]', false],
		['/relative/path', false],
		['1https://example.com', false],
		['http://a.com/K', false],
		['ſ:x', false],
	])('takes %s: %s', (value, valid) => {
		expect(isUri(value)).toBe(valid);
	});
});

describe('jsonObject', () => {
	const strict = jsonObject(v.strictObject({ a: v.optional(v.string()) }));

	it('takes a plain object with the keys a strict object declares', () => {
		expect(v.is(strict, { a: 'x' })).toBe(true);
		expect(v.is(strict, Object.create(null))).toBe(true);
	});

	it.each([
		['an array', []],
		['a Date', new Date(0)],
		['an object with another prototype', Object.create({ a: 'x' })],
	])('refuses %s', (_label, input) => {
		expect(v.is(strict, input)).toBe(false);
	});

	it.each(['extra', 'toString', 'constructor', '__proto__'])(
		'reports the undeclared key %s at its own path',
		(key) => {
			const result = v.safeParse(strict, JSON.parse(`{"${key}":1}`));
			expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual([key]);
		}
	);

	it('lets a loose object take other keys', () => {
		const loose = jsonObject(v.looseObject({ a: v.string() }));
		expect(v.parse(loose, { a: 'x', b: 1 })).toEqual({ a: 'x', b: 1 });
		// Accepted, as JSON Schema accepts it. Valibot leaves a key named after
		// an Object.prototype member out of the output.
		expect(v.is(loose, JSON.parse('{"a":"x","toString":1}'))).toBe(true);
	});
});

describe('jsonVariant', () => {
	const either = jsonVariant(
		v.variant('kind', [
			v.strictObject({ kind: v.literal('a') }),
			v.object({ kind: v.literal('b') }),
		])
	);

	it('refuses a key the strict branch it picks does not declare', () => {
		const result = v.safeParse(either, JSON.parse('{"kind":"a","toString":1}'));
		expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual([
			'toString',
		]);
		expect(v.is(either, JSON.parse('{"kind":"b","toString":1}'))).toBe(true);
	});

	it('refuses an array that holds the key', () => {
		expect(v.is(either, Object.assign([], { kind: 'a' }))).toBe(false);
	});
});

describe('jsonRecord', () => {
	const flags = jsonRecord(v.string(), v.boolean());

	it.each([
		['{"constructor":true}', true],
		['{"constructor":"yes"}', false],
		['{"prototype":"yes"}', false],
		['{"__proto__":"yes"}', false],
	])('checks the key v.record skips in %s', (json, valid) => {
		expect(v.is(flags, JSON.parse(json))).toBe(valid);
	});

	it('refuses an array and a Map', () => {
		expect(v.is(flags, [])).toBe(false);
		expect(v.is(flags, new Map())).toBe(false);
	});
});
