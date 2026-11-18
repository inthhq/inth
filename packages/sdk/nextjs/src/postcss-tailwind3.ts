/**
 * Tailwind 3 PostCSS plugin for c15t stylesheets, re-exported from
 * `@inth/react/postcss-tailwind3` so an app that installs
 * `@inth/nextjs` can list `@inth/nextjs/postcss-tailwind3` without
 * installing `@inth/sdk/ui`.
 * `@inth/react` is the dependency that carries `@inth/sdk/ui`, so the import
 * resolves under strict `node_modules` layouts such as pnpm's.
 * See `@inth/sdk/ui/postcss-tailwind3` for what the plugin does. It must come
 * before `tailwindcss`.
 *
 * @example
 * ```js
 * // postcss.config.mjs
 * export default {
 * 	plugins: {
 * 		'@inth/nextjs/postcss-tailwind3': {},
 * 		tailwindcss: {},
 * 		autoprefixer: {},
 * 	},
 * };
 * ```
 */
export * from '@inth/react/postcss-tailwind3';
export { default } from '@inth/react/postcss-tailwind3';
