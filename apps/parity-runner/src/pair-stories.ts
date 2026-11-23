/**
 * Story pairing.
 *
 * React titles live under `COMPONENTS - REACT/...`; Svelte under
 * `COMPONENTS - SVELTE/...`; Vue under `COMPONENTS - VUE/...`; Solid
 * under `COMPONENTS - SOLID/...`; Astro under `COMPONENTS - ASTRO/...`;
 * Angular under `COMPONENTS - ANGULAR/...`.
 * Pairing strips the `{FRAMEWORK}` segment so `COMPONENTS - REACT/Button`
 * pairs with `COMPONENTS - SVELTE/Button`, `COMPONENTS - VUE/Button`, etc.
 */

export interface StoryEntry {
	/** Full Storybook id (e.g. `components-react-button--primary`). */
	id: string;
	/** Human title (e.g. `COMPONENTS - REACT/Button`). */
	title: string;
	/** Story name (e.g. `Primary`). */
	name: string;
}

export interface PairedStory {
	/** Framework-neutral key (e.g. `Button/Primary`). */
	key: string;
	/** Story metadata per framework, keyed by framework code. */
	entries: Readonly<Record<string, StoryEntry>>;
}

const FRAMEWORK_SEGMENT =
	/^components\s*-\s*(?<capture1>react|svelte|vue|solid|astro|angular)\//iu;

/**
 * Extract the framework code from a Storybook title, or null if the title
 * does not match the expected `COMPONENTS - {FRAMEWORK}/...` pattern.
 */
export const frameworkOf = function frameworkOf(title: string): string | null {
	const match = FRAMEWORK_SEGMENT.exec(title);
	return match?.[1]?.toLowerCase() ?? null;
};

export const storyKey = function storyKey(entry: StoryEntry): string {
	const stripped = entry.title.replace(FRAMEWORK_SEGMENT, '').trim();
	return `${stripped}/${entry.name}`;
};

export const pairStories = function pairStories(
	entriesByFramework: Readonly<Record<string, readonly StoryEntry[]>>
): PairedStory[] {
	const byKey = new Map<string, Record<string, StoryEntry>>();
	for (const [framework, entries] of Object.entries(entriesByFramework)) {
		for (const entry of entries) {
			const key = storyKey(entry);
			const existing = byKey.get(key) ?? {};
			existing[framework] = entry;
			byKey.set(key, existing);
		}
	}
	return Array.from(byKey.entries())
		.map(([key, entries]) => ({ entries, key }))
		.sort((a, b) => a.key.localeCompare(b.key));
};

/**
 * Stories a port has reached only some frameworks with, keyed by story-key
 * prefix, with the frameworks that ship them. The Privacy Choices design
 * lands in React first and in the other adapters in later changes; until a
 * framework renders it, its gap is expected. Parity compares such a story
 * only between the frameworks listed, and never reports the others missing.
 * Add a framework here when its port lands; drop the entry once every
 * framework ships it.
 */
export const NOT_YET_PORTED: Readonly<Record<string, readonly string[]>> = {
	'Privacy Choices/': ['react', 'angular', 'svelte', 'vue'],
};

/**
 * The frameworks a story has been ported to, or `null` when every
 * framework is expected to ship it.
 */
export const portedFrameworks = function portedFrameworks(
	key: string
): readonly string[] | null {
	const prefix = Object.keys(NOT_YET_PORTED).find((candidate) =>
		key.startsWith(candidate)
	);
	return prefix === undefined ? null : (NOT_YET_PORTED[prefix] ?? null);
};

/**
 * Frameworks that were compared and that a pair is missing.
 *
 * A pair with fewer entries than the run enables is not automatically
 * wrong: the Storybook apps do not carry the same catalogue (React ships
 * 17 story files, Solid 5, Astro 4), so most pairs are legitimately
 * partial. What matters is that the gap is visible in the report rather
 * than silently absent, and that both comparisons compute it the same way.
 */
export const missingFrameworks = function missingFrameworks(
	pair: PairedStory,
	frameworks: readonly string[]
): string[] {
	const ported = portedFrameworks(pair.key);
	return frameworks.filter(
		(framework) =>
			!pair.entries[framework] && (!ported || ported.includes(framework))
	);
};

/** `pair` without the entries of frameworks its story is not ported to. */
const withPortedEntries = function withPortedEntries(
	pair: PairedStory
): PairedStory {
	const ported = portedFrameworks(pair.key);
	if (!ported) {
		return pair;
	}
	return {
		entries: Object.fromEntries(
			Object.entries(pair.entries).filter(([framework]) =>
				ported.includes(framework)
			)
		),
		key: pair.key,
	};
};

/**
 * Story-key prefixes no comparison pairs.
 *
 * `Docs/` stories are the docs' design recipes and examples. Each renders
 * the snippet the docs publish for that adapter, and the adapters customize
 * differently (React compound parts, Vue and Svelte slot classes, Astro's
 * server-rendered components), so a shared title does not promise shared
 * markup. The shared conformance plays (`@inth/conformance/play`) check
 * their behavior in each Storybook's `test-storybook` run instead; parity
 * stays on the component stories.
 */
export const NEVER_PAIRED_KEY_PREFIXES = ['Docs/'] as const;

/** A pair the gate will compare, plus the frameworks it does not cover. */
export interface ComparablePair extends PairedStory {
	/** Enabled frameworks that ship no equivalent of this story. */
	missing: string[];
}

/** How a caller narrows the paired set it will compare. */
export interface ComparablePairOptions {
	/** The frameworks this run was told to check. */
	frameworks: readonly string[];
	/**
	 * A framework every pair must include, when the comparison measures
	 * against one. The visual gate needs React; the descriptive checks
	 * compare whatever pair they are given.
	 */
	baseline?: string;
	/** Story-key prefixes this comparison owns elsewhere. */
	excludeKeyPrefixes?: readonly string[];
}

/**
 * The one place a paired story is judged comparable.
 *
 * Both gates used to filter their own way — one required two entries and
 * dropped DevTools, the other required React — so a change to one silently
 * changed what the other compared. They call this instead.
 */
export const selectComparablePairs = function selectComparablePairs(
	entriesByFramework: Readonly<Record<string, readonly StoryEntry[]>>,
	options: ComparablePairOptions
): ComparablePair[] {
	const excluded = [
		...NEVER_PAIRED_KEY_PREFIXES,
		...(options.excludeKeyPrefixes ?? []),
	];
	return pairStories(entriesByFramework)
		.map(withPortedEntries)
		.filter((pair) => Object.keys(pair.entries).length >= 2)
		.filter((pair) => !options.baseline || pair.entries[options.baseline])
		.filter((pair) => !excluded.some((prefix) => pair.key.startsWith(prefix)))
		.map((pair) => ({
			...pair,
			missing: missingFrameworks(pair, options.frameworks),
		}));
};

/** The longest one story may take to reach network idle. */
export const STORY_LOAD_TIMEOUT_MS = 30_000;

/**
 * Time budget per story a test opens: navigation to network idle, fonts,
 * the settle wait and the capture. One visit takes about 1 s on a
 * developer machine; the budget leaves room for slower CI runners.
 */
export const STORY_VISIT_BUDGET_MS = 3000;

/**
 * The timeout for a test that opens every story of `pairs` once per
 * framework. Such a test grows with the catalogue, so a fixed timeout
 * fails on whichever story is open when the catalogue outgrows it.
 *
 * @param floorMs - The configured timeout, kept for a small catalogue.
 * @returns The test's timeout, in ms.
 */
export const storyVisitTimeout = function storyVisitTimeout(
	pairs: readonly PairedStory[],
	floorMs: number
): number {
	const visits = pairs.reduce(
		(total, pair) => total + Object.keys(pair.entries).length,
		0
	);
	return Math.max(floorMs, visits * STORY_VISIT_BUDGET_MS);
};
