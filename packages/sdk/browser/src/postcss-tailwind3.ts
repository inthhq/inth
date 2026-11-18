/**
 * Tailwind 3 PostCSS plugin for Inth stylesheets: the plugin from
 * `@inth/sdk/ui/postcss-tailwind3`, also listed as `@inth/sdk/postcss-tailwind3`.
 * See `@inth/sdk/ui/postcss-tailwind3` for what the plugin does. It must come
 * before `tailwindcss`.
 *
 * @example
 * ```js
 * // postcss.config.mjs
 * export default {
 * 	plugins: {
 * 		'@inth/sdk/postcss-tailwind3': {},
 * 		tailwindcss: {},
 * 		autoprefixer: {},
 * 	},
 * };
 * ```
 */
export * from '@inth/sdk-ui/postcss-tailwind3';
export { default } from '@inth/sdk-ui/postcss-tailwind3';
