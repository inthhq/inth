const config = {
	// oxlint-disable-next-line sort-keys -- PostCSS runs plugins in key order; Inth's must precede tailwindcss.
	plugins: {
		'@inth/nextjs/postcss-tailwind3': {},
		tailwindcss: {},
		autoprefixer: {},
	},
};

export default config;
