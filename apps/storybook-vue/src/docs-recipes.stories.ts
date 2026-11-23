import {
	recipeAccepts,
	recipeRejects,
	recipeRenders,
} from '@inth/conformance/play/docs-recipes';
import ConsentManager from '@inth/vue/runtime/components/consent-manager.vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Component } from 'vue';

import RecipePage from './docs-recipe-page.vue';
import BottomBar from './docs-recipes/bottom-bar.vue';
import HeadlessBar from './docs-recipes/cookie-bar.vue';
import { useStorybookConsent } from './storybook-consent-fixtures';

/**
 * The designs on the docs' "Banner designs" page. Each story renders one
 * recipe from `docs-recipes/` over a plain page, with an in-memory policy
 * and no analytics.
 */
const meta = {
	parameters: { layout: 'fullscreen' },
	title: 'Docs/Banner designs',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const recipe =
	(
		banner: Component,
		options?: Parameters<typeof useStorybookConsent>[1]
	): Story['render'] =>
	() => ({
		components: { Banner: banner, ConsentManager, RecipePage },
		setup() {
			useStorybookConsent('banner', options);
		},
		template: '<RecipePage><Banner /><ConsentManager /></RecipePage>',
	});

const bottomBar = recipe(BottomBar);
const headlessBar = recipe(HeadlessBar);

/** Stock banner, `container: { type: 'banner', edge: 'bottom' }`. */
export const BottomBarDesign: Story = {
	play: recipeRenders,
	render: bottomBar,
};
export const BottomBarAccept: Story = {
	play: recipeAccepts,
	render: bottomBar,
};
export const BottomBarReject: Story = {
	play: recipeRejects,
	render: bottomBar,
};

/** Own markup on the composables, stock dialog for preferences. */
export const HeadlessBarDesign: Story = {
	play: recipeRenders,
	render: headlessBar,
};
export const HeadlessBarAccept: Story = {
	play: recipeAccepts,
	render: headlessBar,
};
export const HeadlessBarReject: Story = {
	play: recipeRejects,
	render: headlessBar,
};
