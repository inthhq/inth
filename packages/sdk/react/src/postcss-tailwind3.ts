/**
 * Tailwind 3 PostCSS plugin for c15t stylesheets, re-exported from
 * `@inth/sdk/ui/postcss-tailwind3` so an app that installs `@inth/react` can list
 * `@inth/react/postcss-tailwind3` without installing `@inth/sdk/ui`.
 * See `@inth/sdk/ui/postcss-tailwind3` for what the plugin does. It must come
 * before `tailwindcss`.
 *
 * @example
 * ```js
 * // postcss.config.mjs
 * export default {
 * 	plugins: {
 * 		'@inth/react/postcss-tailwind3': {},
 * 		tailwindcss: {},
 * 		autoprefixer: {},
 * 	},
 * };
 * ```
 */
export * from '@inth/sdk/ui/postcss-tailwind3';
export { default } from '@inth/sdk/ui/postcss-tailwind3';
