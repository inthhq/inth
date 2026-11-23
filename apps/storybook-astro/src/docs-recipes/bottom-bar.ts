/**
 * The stock prompt as a full-width Banner along the bottom edge, as
 * `inth()` integration options. The Storybook prerenders the prompt with
 * them; the docs publish the region.
 */
export const bottomBarOptions = {
	// #region docs:bottom-bar title="astro.config.mjs (partial)"
	presentation: {
		prompt: { container: { edge: 'bottom', type: 'banner' } },
	},
	// #endregion docs:bottom-bar
} as const;
