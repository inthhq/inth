/**
 * Tailwind 3 PostCSS plugin for c15t stylesheets, re-exported from
 * `@c15t/ui/postcss-tailwind3` so an app that installs `@c15t/angular` can
 * list `@c15t/angular/postcss-tailwind3` without installing `@c15t/ui`.
 * See `@c15t/ui/postcss-tailwind3` for what the plugin does. It must come
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
 * 		"@c15t/angular/postcss-tailwind3": {},
 * 		"tailwindcss": {}
 * 	}
 * }
 * ```
 */
export * from '@c15t/ui/postcss-tailwind3';
export { default } from '@c15t/ui/postcss-tailwind3';
