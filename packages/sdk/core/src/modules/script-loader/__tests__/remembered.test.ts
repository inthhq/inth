/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	REMEMBERED_REGISTRY_MAX_AGE_MS,
	rememberedRegistry,
} from '../remembered';
import type { RegistryMemory } from '../remembered';

const LIST = {
	files: { 'https://cdn.vendor.example/logger.js': null },
	sources: {
		vendor: { integrity: 'sha384-abc', src: 'https://acme.inth.app/v.js' },
	},
};

const memoryAt = (now: () => number, projectUrl = 'https://acme.inth.app') =>
	rememberedRegistry(projectUrl, now) as RegistryMemory;

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('rememberedRegistry', () => {
	test('reads back the sources and files it was given, and nothing else', () => {
		const memory = memoryAt(() => 1000);
		memory.write({ ...LIST, unknown: 'dropped' });

		expect(memory.read()).toEqual(LIST);
	});

	test('keeps each backend apart, a relative projectUrl resolved against the page', () => {
		memoryAt(() => 1000, '/api/c15t').write(LIST);

		expect(
			memoryAt(() => 1000, 'https://other.inth.app').read()
		).toBeUndefined();
		expect(
			memoryAt(() => 1000, new URL('/api/c15t', document.baseURI).href).read()
		).toEqual(LIST);
	});

	test(`uses a list for ${REMEMBERED_REGISTRY_MAX_AGE_MS / 86_400_000} days, then forgets it`, () => {
		memoryAt(() => 0).write(LIST);

		expect(memoryAt(() => REMEMBERED_REGISTRY_MAX_AGE_MS).read()).toEqual(LIST);
		expect(
			memoryAt(() => REMEMBERED_REGISTRY_MAX_AGE_MS + 1).read()
		).toBeUndefined();
		expect(localStorage.length).toBe(0);
	});

	test('forgets the list when an answer carries none', () => {
		const memory = memoryAt(() => 1000);
		memory.write(LIST);
		memory.write(null);

		expect(memory.read()).toBeUndefined();
		expect(localStorage.length).toBe(0);
	});

	test.each([
		['text that is not JSON', '{'],
		[
			'another version',
			JSON.stringify({ registry: LIST, savedAt: 1000, v: 2 }),
		],
		['no time', JSON.stringify({ registry: LIST, v: 1 })],
		['a time to come', JSON.stringify({ registry: LIST, savedAt: 5000, v: 1 })],
		[
			'a list that is not an object',
			JSON.stringify({ registry: [], savedAt: 1000, v: 1 }),
		],
	])('reads %s as no list, and forgets it', (_case, raw) => {
		const memory = memoryAt(() => 1000);
		memory.write(LIST);
		localStorage.setItem(localStorage.key(0) as string, raw);

		expect(memory.read()).toBeUndefined();
		expect(localStorage.length).toBe(0);
	});

	test('reads and writes nothing, without throwing, when storage refuses', () => {
		const memory = memoryAt(() => 1000);
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(() => memory.write(LIST)).not.toThrow();
		expect(memory.read()).toBeUndefined();
	});

	test('remembers nothing without a projectUrl', () => {
		expect(rememberedRegistry(undefined)).toBeUndefined();
		expect(rememberedRegistry('')).toBeUndefined();
	});
});
