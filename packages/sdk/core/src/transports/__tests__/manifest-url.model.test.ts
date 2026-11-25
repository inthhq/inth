import { describe, expect, test } from 'vite-plus/test';

import { projectUrlOfManifest } from '../manifest-url.model';

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
