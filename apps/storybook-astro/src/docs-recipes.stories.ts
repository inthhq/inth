import {
	recipeAccepts,
	recipeRejects,
	recipeRenders,
} from '@inth/conformance/play/docs-recipes';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { renderAstroStory, whenPromptReady } from './render-astro-story';

import '../../docs-recipe-page.css';

/**
 * The Astro version of the docs' bottom bar design: the server-rendered
 * banner with the `presentation` option from `docs-recipes/bottom-bar.ts`.
 * Like the React, Vue and Svelte recipes it renders over the demo page,
 * with a "Privacy settings" control and the stock dialog, so the shared
 * recipe checks and the parity gate compare the same scene.
 */
const meta = {
	parameters: { layout: 'fullscreen' },
	title: 'Docs/Banner designs',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const render = () => renderAstroStory('consent-banner--docs-bottom-bar');

/**
 * Wait for the browser prompt, then run the shared play. The story inserts
 * the server-rendered markup without its inline scripts, so a tap before
 * the client boot mounts the prompt has nothing to replay it.
 */
const afterPrompt =
	(play: NonNullable<Story['play']>): NonNullable<Story['play']> =>
	async (context) => {
		await whenPromptReady();
		await play(context);
	};

/** Stock prompt, `container: { type: 'banner' }`. */
export const BottomBarDesign: Story = {
	play: afterPrompt(recipeRenders),
	render,
};
export const BottomBarAccept: Story = {
	play: afterPrompt(recipeAccepts),
	render,
};
export const BottomBarReject: Story = {
	play: afterPrompt(recipeRejects),
	render,
};
