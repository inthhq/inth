import { describe, expect, test } from 'vitest';

import {
	insertPrefetchScript,
	prefetchScriptOffset,
} from '../prefetch-placement.model';

describe('prefetch script placement', () => {
	test.each([
		['<head><meta charset="utf-8"><link rel="stylesheet">', 28],
		['<html><head lang="en"><title>x</title>', 22],
		['<!doctype html><html><body>', 21],
		['<!doctype html><body>', 15],
	])('goes after the first anchor in %s', (html, offset) => {
		expect(prefetchScriptOffset(html)).toBe(offset);
	});

	test('a head chunk with the charset gets the tag; otherwise it goes first', () => {
		const withCharset = ['<title>x</title>', '<meta charset="utf-8"><style>'];
		insertPrefetchScript(withCharset, '<script></script>');
		expect(withCharset).toEqual([
			'<title>x</title>',
			'<meta charset="utf-8"><script></script><style>',
		]);
		const without = ['<title>x</title>'];
		insertPrefetchScript(without, '<script></script>');
		expect(without).toEqual(['<script></script>', '<title>x</title>']);
	});
});
