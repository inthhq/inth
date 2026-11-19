import { describe, expect, test } from 'vitest';

import { ruleMatches } from '../hold';
import type { NetworkBlockerRule } from '../types';
import { normalizeMethod, parseUrl } from '../url';

const rule: NetworkBlockerRule = {
	category: 'marketing',
	domain: 'example.com',
	id: 'r',
};

describe('normalizeMethod', () => {
	test('returns GET for missing input', () => {
		expect(normalizeMethod(undefined)).toBe('GET');
		expect(normalizeMethod(null)).toBe('GET');
		expect(normalizeMethod('')).toBe('GET');
	});

	test('upper-cases inputs', () => {
		expect(normalizeMethod('post')).toBe('POST');
		expect(normalizeMethod('Delete')).toBe('DELETE');
	});
});

describe('parseUrl', () => {
	test('passes through URL instances', () => {
		const url = new URL('https://example.com/');
		expect(parseUrl(url)).toBe(url);
	});

	test('handles absolute URL strings', () => {
		const result = parseUrl('https://example.com/foo');
		expect(result?.hostname).toBe('example.com');
		expect(result?.pathname).toBe('/foo');
	});

	test('returns null for inputs the URL constructor cannot resolve', () => {
		// Unbalanced bracket — invalid IPv6 → URL constructor throws.
		expect(parseUrl('http://[::1')).toBeNull();
	});
});

const at = (url: string) => new URL(url);

describe('ruleMatches', () => {
	test.each([
		['the exact domain', 'https://example.com/', true],
		['a subdomain', 'https://cdn.example.com/', true],
		['a non-suffix substring', 'https://badexample.com/', false],
		['mixed case', 'https://CDN.Example.Com/', true],
	])('matches %s: %s', (_label, url, expected) => {
		expect(ruleMatches(rule, at(url), 'GET')).toBe(expected);
	});

	test('never matches a rule with a blank domain', () => {
		expect(
			ruleMatches({ ...rule, domain: ' ' }, at('https://example.com/'), 'GET')
		).toBe(false);
	});

	test('matches a pathname holding pathIncludes, and every path without it', () => {
		const track = { ...rule, pathIncludes: 'track' };
		expect(ruleMatches(rule, at('https://example.com/anything'), 'GET')).toBe(
			true
		);
		expect(ruleMatches(track, at('https://example.com/api/track'), 'GET')).toBe(
			true
		);
		expect(
			ruleMatches(track, at('https://example.com/api/health'), 'GET')
		).toBe(false);
	});

	test('matches one of methods, case-insensitive, and every method without it', () => {
		const writes = { ...rule, methods: ['POST', 'PUT'] };
		expect(ruleMatches(rule, at('https://example.com/'), 'POST')).toBe(true);
		expect(ruleMatches(writes, at('https://example.com/'), 'post')).toBe(true);
		expect(ruleMatches(writes, at('https://example.com/'), 'GET')).toBe(false);
	});
});
