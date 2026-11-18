/**
 * Tailwind 3 PostCSS plugin for Inth stylesheets, re-exported from
 * `@inth/sdk/ui/postcss-tailwind3` so an app that installs `@inth/angular` can
 * list `@inth/angular/postcss-tailwind3` without installing `@inth/sdk/ui`.
 * See `@inth/sdk/ui/postcss-tailwind3` for what the plugin does. It must come
 * before `tailwindcss`.
 *
 * Shipped as plain ESM next to the ng-packagr bundles: it is not Angular
 * code, and ng-packagr's bundle drops a `default` export.
 *
 * @example
 * ```json
 * // .postcssrc.json
 * {
 * 	"plugins": {
 * 		"@inth/angular/postcss-tailwind3": {},
 * 		"tailwindcss": {}
 * 	}
 * }
 * ```
 */
export * from '@inth/sdk/ui/postcss-tailwind3';
export { default } from '@inth/sdk/ui/postcss-tailwind3';
