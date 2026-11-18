// oxlint-disable sort-keys -- PostCSS runs plugins in the order listed.
// #region docs:postcss-config title="postcss.config.mjs"
export default {
	plugins: {
		'@inth/react/postcss-tailwind3': {},
		tailwindcss: {},
		autoprefixer: {},
	},
};
// #endregion docs:postcss-config
