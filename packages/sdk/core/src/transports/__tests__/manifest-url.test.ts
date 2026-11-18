import { describe, expect, test } from 'vitest';

import { createManifestTransport } from '../manifest';
import { projectUrlOfManifest } from '../manifest-url';

describe('projectUrlOfManifest', () => {
	test.each([
		['https://acme.inth.app/manifest', 'https://acme.inth.app'],
		[
			'https://acme.inth.app/api/inth/manifest/',
			'https://acme.inth.app/api/inth',
		],
		['https://acme.inth.app/manifest?v=2#top', 'https://acme.inth.app'],
		['/api/inth/manifest', '/api/inth'],
	])('%s names the backend %s', (manifestUrl, projectUrl) => {
		expect(projectUrlOfManifest(manifestUrl)).toBe(projectUrl);
	});

	test.each([
		'https://cdn.example.com/policy.json',
		'https://manifest',
		'ftp://acme.inth.app/manifest',
		'',
		undefined,
	])('%s names no backend', (manifestUrl) => {
		expect(projectUrlOfManifest(manifestUrl)).toBeUndefined();
	});
});

test('the server transport sends no save to a manifest asset', async () => {
	const requests: string[] = [];
	const transport = createManifestTransport({
		fetch: (input) => {
			requests.push(String(input));
			return Promise.resolve(new Response('{}'));
		},
		manifestUrl: 'https://cdn.example.com/policy.json',
	});
	await expect(transport.identify({ id: 'user-1' }, 'sub_1')).rejects.toThrow();
	expect(requests.some((url) => url.includes('policy.json/'))).toBe(false);
});
