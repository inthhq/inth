import { describe, expect, it } from 'vite-plus/test';

import { buildQueuePixelInstall } from './install-builders';

const loadScript = {
	async: true,
	src: 'https://pixel.example/loader.js',
	type: 'loadScript',
} as const;

describe('vendor install builders', () => {
	it('builds an init call followed by a script load', () => {
		expect(
			buildQueuePixelInstall({
				global: 'rdt',
				initArgs: ['init', '{{pixelId}}'],
				loadScript,
			})
		).toEqual([
			{
				args: ['init', '{{pixelId}}'],
				global: 'rdt',
				type: 'callGlobal',
			},
			loadScript,
		]);
	});

	it('adds an optional tracking call before loading the script', () => {
		expect(
			buildQueuePixelInstall({
				global: 'snaptr',
				initArgs: ['init', '{{pixelId}}'],
				loadScript,
				trackStep: {
					args: ['track', 'PAGE_VIEW'],
				},
			})
		).toEqual([
			{
				args: ['init', '{{pixelId}}'],
				global: 'snaptr',
				type: 'callGlobal',
			},
			{
				args: ['track', 'PAGE_VIEW'],
				global: 'snaptr',
				type: 'callGlobal',
			},
			loadScript,
		]);
	});
});
