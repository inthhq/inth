import { expect, test } from 'bun:test';

import { NO_DEVTOOLS, pickDevToolsStories } from './devtools-stories';
import type { StoryEntry } from './pair-stories';

const devTools = (framework: string): StoryEntry => ({
	id: `${framework}-core-devtools--default`,
	name: 'Default',
	title: `COMPONENTS - ${framework.toUpperCase()}/Core/DevTools`,
});
const banner = (framework: string): StoryEntry => ({
	id: `${framework}-consent-banner--default`,
	name: 'Default',
	title: `COMPONENTS - ${framework.toUpperCase()}/Consent Banner`,
});

test('only Astro may lack a DevTools story', () => {
	expect([...NO_DEVTOOLS]).toEqual(['astro']);
});

test('pickDevToolsStories compares each framework with a DevTools story and skips Astro', () => {
	expect(
		pickDevToolsStories([
			{ framework: 'react', stories: [banner('react'), devTools('react')] },
			{ framework: 'astro', stories: [banner('astro')] },
			{ framework: 'vue', stories: [devTools('vue')] },
		])
	).toEqual({
		compared: [
			{ framework: 'react', id: 'react-core-devtools--default' },
			{ framework: 'vue', id: 'vue-core-devtools--default' },
		],
		skipped: ['astro'],
	});
});

test('pickDevToolsStories fails a framework outside NO_DEVTOOLS without a DevTools story', () => {
	expect(() =>
		pickDevToolsStories([
			{ framework: 'react', stories: [devTools('react')] },
			{ framework: 'svelte', stories: [banner('svelte')] },
		])
	).toThrow(/svelte has no Core\/DevTools Default story/u);
});

test('pickDevToolsStories fails React without a DevTools story', () => {
	expect(() =>
		pickDevToolsStories([{ framework: 'react', stories: [] }])
	).toThrow(/react has no Core\/DevTools/u);
});
