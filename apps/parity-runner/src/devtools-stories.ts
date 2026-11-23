import type { StoryEntry } from './pair-stories';

/**
 * Frameworks that ship no DevTools component, so their Storybook has no
 * DevTools story to compare. Any other framework without one fails: a
 * missing story there is a regression, not a gap to skip.
 */
export const NO_DEVTOOLS: ReadonlySet<string> = new Set(['astro']);

const isDevToolsStory = (story: StoryEntry) =>
	story.title.endsWith('/Core/DevTools') && story.name === 'Default';

/**
 * Picks each framework's DevTools story from its Storybook index, in the
 * order given. A framework in `NO_DEVTOOLS` is skipped whether or not it
 * has one.
 *
 * @throws When a framework outside `NO_DEVTOOLS` has no DevTools story.
 */
export const pickDevToolsStories = function pickDevToolsStories(
	indexes: readonly { framework: string; stories: readonly StoryEntry[] }[]
): { compared: { framework: string; id: string }[]; skipped: string[] } {
	const compared: { framework: string; id: string }[] = [];
	const skipped: string[] = [];
	for (const { framework, stories } of indexes) {
		if (NO_DEVTOOLS.has(framework)) {
			skipped.push(framework);
			continue;
		}
		const entry = stories.find(isDevToolsStory);
		if (!entry) {
			throw new Error(
				`${framework} has no Core/DevTools Default story. Only frameworks in NO_DEVTOOLS (${[...NO_DEVTOOLS].join(', ')}) may lack one.`
			);
		}
		compared.push({ framework, id: entry.id });
	}
	return { compared, skipped };
};
