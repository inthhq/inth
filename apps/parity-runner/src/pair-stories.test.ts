import { expect, test } from 'bun:test';

import {
	frameworkOf,
	missingFrameworks,
	missingRequiredStories,
	pairStories,
	selectComparablePairs,
	STORY_VISIT_BUDGET_MS,
	storyKey,
	storyVisitTimeout,
} from './pair-stories';
import type { StoryEntry } from './pair-stories';

test('frameworkOf extracts framework from title', () => {
	expect(frameworkOf('COMPONENTS - REACT/Button')).toBe('react');
	expect(frameworkOf('COMPONENTS - SVELTE/Consent Banner')).toBe('svelte');
	expect(frameworkOf('COMPONENTS - VUE/Dialog')).toBe('vue');
	expect(frameworkOf('COMPONENTS - SOLID/Switch')).toBe('solid');
	expect(frameworkOf('COMPONENTS - ANGULAR/Core/Consent Banner')).toBe(
		'angular'
	);
});

test('frameworkOf tolerates varied whitespace', () => {
	expect(frameworkOf('COMPONENTS-REACT/Button')).toBe('react');
	expect(frameworkOf('components - svelte/Button')).toBe('svelte');
});

test('frameworkOf returns null for unrecognized titles', () => {
	expect(frameworkOf('Button')).toBeNull();
	expect(frameworkOf('PRIMITIVES/Switch')).toBeNull();
});

test('storyKey strips framework segment and appends story name', () => {
	const entry: StoryEntry = {
		id: 'components-react-button--primary',
		name: 'Primary',
		title: 'COMPONENTS - REACT/Button',
	};
	expect(storyKey(entry)).toBe('Button/Primary');
});

test('pairStories groups equivalent entries across frameworks', () => {
	const react: StoryEntry[] = [
		{
			id: 'components-react-button--primary',
			name: 'Primary',
			title: 'COMPONENTS - REACT/Button',
		},
		{
			id: 'components-react-banner--default',
			name: 'Default',
			title: 'COMPONENTS - REACT/Banner',
		},
	];
	const svelte: StoryEntry[] = [
		{
			id: 'components-svelte-button--primary',
			name: 'Primary',
			title: 'COMPONENTS - SVELTE/Button',
		},
	];

	const paired = pairStories({ react, svelte });

	expect(paired).toHaveLength(2);
	const button = paired.find((p) => p.key === 'Button/Primary');
	expect(button?.entries.react?.id).toBe('components-react-button--primary');
	expect(button?.entries.svelte?.id).toBe('components-svelte-button--primary');
	const banner = paired.find((p) => p.key === 'Banner/Default');
	expect(banner?.entries.react?.id).toBe('components-react-banner--default');
	expect(banner?.entries.svelte).toBeUndefined();
});

test('pairStories returns stable, sorted output', () => {
	const react: StoryEntry[] = [
		{
			id: 'a',
			name: 'Default',
			title: 'COMPONENTS - REACT/Z-Comp',
		},
		{
			id: 'b',
			name: 'Default',
			title: 'COMPONENTS - REACT/A-Comp',
		},
	];
	const paired = pairStories({ react });
	expect(paired.map((p) => p.key)).toEqual([
		'A-Comp/Default',
		'Z-Comp/Default',
	]);
});

const entryFor = function entryFor(
	framework: string,
	component: string,
	name = 'Default'
): StoryEntry {
	return {
		id: `components-${framework}-${component}--${name.toLowerCase()}`,
		name,
		title: `COMPONENTS - ${framework.toUpperCase()}/${component}`,
	};
};

test('selectComparablePairs drops pairs only one framework ships', () => {
	const pairs = selectComparablePairs(
		{
			react: [entryFor('react', 'Button'), entryFor('react', 'ConsentGate')],
			svelte: [entryFor('svelte', 'Button')],
		},
		{ frameworks: ['react', 'svelte'] }
	);

	expect(pairs.map((pair) => pair.key)).toEqual(['Button/Default']);
});

test('selectComparablePairs reports the frameworks a pair is missing', () => {
	const [pair] = selectComparablePairs(
		{
			react: [entryFor('react', 'Button')],
			svelte: [entryFor('svelte', 'Button')],
		},
		{ frameworks: ['react', 'svelte', 'vue', 'astro'] }
	);

	expect(pair?.missing).toEqual(['vue', 'astro']);
});

test('selectComparablePairs requires the baseline when one is named', () => {
	const pairs = selectComparablePairs(
		{
			svelte: [entryFor('svelte', 'Button')],
			vue: [entryFor('vue', 'Button')],
		},
		{ baseline: 'react', frameworks: ['react', 'svelte', 'vue'] }
	);

	expect(pairs).toEqual([]);
});

test('selectComparablePairs honours excluded key prefixes', () => {
	const pairs = selectComparablePairs(
		{
			react: [
				entryFor('react', 'Button'),
				entryFor('react', 'Core/DevTools/Panel'),
			],
			svelte: [
				entryFor('svelte', 'Button'),
				entryFor('svelte', 'Core/DevTools/Panel'),
			],
		},
		{ excludeKeyPrefixes: ['Core/DevTools/'], frameworks: ['react', 'svelte'] }
	);

	expect(pairs.map((pair) => pair.key)).toEqual(['Button/Default']);
});

test('selectComparablePairs never pairs docs recipe stories', () => {
	// `Docs/Banner designs` shows each adapter's own way to customize the
	// banner (React compound parts, Vue and Svelte slot classes), so the
	// same title does not mean the same markup.
	const docsEntry = (): StoryEntry => ({
		id: 'docs-banner-designs--slim-bar-design',
		name: 'Slim Bar Design',
		title: 'Docs/Banner designs',
	});
	const pairs = selectComparablePairs(
		{
			react: [entryFor('react', 'Button'), docsEntry()],
			vue: [entryFor('vue', 'Button'), docsEntry()],
		},
		{ baseline: 'react', frameworks: ['react', 'vue'] }
	);

	expect(pairs.map((pair) => pair.key)).toEqual(['Button/Default']);
});

test('storyVisitTimeout grows with every story the test opens', () => {
	const entry = (framework: string): StoryEntry => ({
		id: `components-${framework}-button--primary`,
		name: 'Primary',
		title: `COMPONENTS - ${framework.toUpperCase()}/Button`,
	});
	const pair = (...frameworks: string[]) => ({
		entries: Object.fromEntries(
			frameworks.map((framework) => [framework, entry(framework)])
		),
		key: 'Button/Primary',
	});
	const pairs = Array.from({ length: 30 }, () =>
		pair('react', 'svelte', 'vue', 'angular')
	);
	expect(storyVisitTimeout(pairs, 120_000)).toBe(120 * STORY_VISIT_BUDGET_MS);
	expect(storyVisitTimeout([pair('react', 'svelte')], 120_000)).toBe(120_000);
});

test('a container story pairs every framework that ships it, and the rest are missing it', () => {
	const entry = (framework: string, title: string): StoryEntry => ({
		id: `components-${framework}-x--card-start-eu`,
		name: 'Card Start EU',
		title: `COMPONENTS - ${framework.toUpperCase()}/${title}`,
	});
	const frameworks = ['react', 'svelte', 'vue'];
	const pairs = selectComparablePairs(
		{
			react: [entry('react', 'Core/Consent Banner')],
			svelte: [entry('svelte', 'Core/Consent Banner')],
			vue: [],
		},
		{ frameworks }
	);
	expect(
		pairs.map((pair) => [pair.key, Object.keys(pair.entries).sort()])
	).toEqual([['Core/Consent Banner/Card Start EU', ['react', 'svelte']]]);
	expect(pairs[0]?.missing).toEqual(['vue']);
	expect(
		missingFrameworks(
			{
				entries: { react: entry('react', 'Core/Consent Banner') },
				key: 'Core/Consent Banner/Card Start EU',
			},
			frameworks
		)
	).toEqual(['svelte', 'vue']);
});

test('missingRequiredStories reads coverage from every indexed story', () => {
	const entry = (framework: string, title: string, name: string) => ({
		id: `${framework}-${title}--${name}`.toLowerCase(),
		name,
		title: `COMPONENTS - ${framework.toUpperCase()}/${title}`,
	});
	const byFramework = {
		// Astro ships no Consent Gate, so React's gate story pairs with nothing.
		astro: [entry('astro', 'Core/Consent Banner', 'Default')],
		react: [
			entry('react', 'Core/Consent Banner', 'Default'),
			entry('react', 'Core/Consent Gate', 'Placeholder'),
		],
	};
	const required = [
		'Core/Consent Banner/Default',
		'Core/Consent Gate/Placeholder',
	];
	expect(missingRequiredStories(byFramework, required, ['react'])).toEqual([]);
	expect(
		missingRequiredStories(byFramework, required, ['react', 'astro'])
	).toEqual(['Core/Consent Gate/Placeholder: astro']);
	expect(
		missingRequiredStories({ astro: byFramework.astro }, required, ['react'])
	).toEqual([
		'Core/Consent Banner/Default: react',
		'Core/Consent Gate/Placeholder: react',
	]);
});
