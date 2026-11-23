/**
 * Where each component's rules sit. Names are the flat files in
 * `dist/styles/components` (`prompt` is the consent banner, `panel` the
 * consent dialog, `manager` the preference widget, `consent-gate` the
 * ConsentGate placeholder).
 *
 * `styles.css` holds the first-paint rules, then the dialog rules. The order
 * matters where a dialog rule and a first-paint rule match the same element
 * with the same specificity: the dialog rule wins, as it did while it
 * shipped in a stylesheet that loaded later.
 *
 * The v6 Privacy Choices rules (`PRESENTATION_SHEETS` and
 * `PRIVACY_CHOICES_DIALOG_COMPONENTS`) stay out of `styles.css`, so an app
 * that imports it doesn't pay for UI it doesn't render yet. They ship in
 * `styles/privacy-choices.css` and in sheets of their own.
 *
 * `generate-css-entrypoints.ts` fails the build when a component is in
 * none of the lists, so a new component needs a deliberate choice.
 */

/**
 * Surfaces a first paint can show: the banner, the dialog trigger and the
 * ConsentGate placeholder, plus the pieces they render (buttons, actions,
 * branding, legal links).
 */
export const FIRST_PAINT_COMPONENTS = [
	'branding',
	'button',
	'consent-actions',
	'consent-gate',
	'legal-links',
	'panel-trigger',
	'prompt',
] as const;

/**
 * The first-paint components split by the surface that renders them, one
 * `styles/sheets/<name>.js` each. Every first-paint component sits in
 * exactly one sheet, so no rule reaches the page twice: a repeated rule
 * would re-apply after rules that override it whenever its sheet is
 * inserted later. The button has a sheet of its own because the banner, the
 * ConsentGate and the dialog all render it. The trigger renders none of the
 * others (its logo is a bare SVG).
 *
 * Each sheet carries the component variables its rules read. The theme
 * tokens ride in the `tokens` sheet, which every surface renders first.
 */
export const SURFACE_SHEETS = {
	banner: ['branding', 'consent-actions', 'legal-links', 'prompt'],
	button: ['button'],
	'consent-gate': ['consent-gate'],
	trigger: ['panel-trigger'],
} as const satisfies Record<
	string,
	readonly (typeof FIRST_PAINT_COMPONENTS)[number][]
>;

/**
 * The v6 consent prompt, split by presentation, one
 * `styles/sheets/<name>.js` each: `surface` is the shell every
 * presentation renders, `card`, `bar` and `drawer` hold one presentation
 * each, and `expand` the options Customize opens in place (and the side
 * Drawer's scroll area). A page that renders a Card carries `tokens`,
 * `button`, `surface` and `card`, and no Banner or Drawer rule.
 *
 * Their rules open `styles/privacy-choices.css`; `styles.css` and
 * `first-paint` don't carry them.
 */
export const PRESENTATION_SHEETS = {
	bar: ['consent-bar'],
	card: ['consent-card'],
	drawer: ['consent-drawer'],
	expand: ['consent-expand'],
	surface: ['consent-surface'],
} as const satisfies Record<string, readonly string[]>;

/** Every component in `PRESENTATION_SHEETS`, in `styles/privacy-choices.css` order. */
export const PRESENTATION_COMPONENTS = [
	'consent-surface',
	'consent-card',
	'consent-bar',
	'consent-drawer',
	'consent-expand',
] as const satisfies readonly (typeof PRESENTATION_SHEETS)[keyof typeof PRESENTATION_SHEETS][number][];

/**
 * Rendered only inside the consent dialog or the preference widget. Their
 * rules follow the first-paint rules in `styles.css`.
 */
export const DIALOG_COMPONENTS = [
	'accordion',
	'collapsible',
	'manager',
	'opt-out-confirmation',
	'panel',
	'preference-item',
	'switch',
	'tabs',
	'vendor-list',
] as const;

/**
 * The v6 "Your Privacy Choices" dialog body, in the
 * `styles/sheets/privacy-choices-dialog.js` sheet and after the
 * presentation rules in `styles/privacy-choices.css`. It renders over the
 * `expand` sheet, whose `scroll` and `group` classes it reuses.
 */
export const PRIVACY_CHOICES_DIALOG_COMPONENTS = ['privacy-choices'] as const;

/** The sheet that holds `PRIVACY_CHOICES_DIALOG_COMPONENTS`. */
export const PRIVACY_CHOICES_DIALOG_SHEET = 'privacy-choices-dialog';

/** Prefix of the IAB TCF components, which go into `iab/styles.css`. */
export const IAB_PREFIX = 'iab-';

/** IAB banner rules, delivered with the first paint. */
export const IAB_FIRST_PAINT_COMPONENTS = ['iab-prompt'] as const;

/** IAB dialog rules, delivered when the dialog loads. */
export const IAB_DIALOG_COMPONENTS = ['iab-panel'] as const;

/**
 * Tailwind 4's layer order: it emits `@layer properties;` and then
 * `@layer theme, base, components, utilities;`. Layers rank by first
 * mention, so a sheet that reaches the page before Tailwind's would declare
 * `components` first and rank it below `base`, where preflight zeroes the
 * banner's padding and borders. Every layered stylesheet opens with the
 * full order, so `components` lands between `base` and `utilities`
 * whichever sheet loads first. Without Tailwind the other four layers stay
 * empty. `@inth/sdk-ui/postcss-tailwind3` removes the statement with the blocks.
 *
 * That covers the aggregates (`styles.css` loaded above the app's own CSS,
 * or injected by Astro from `page-ssr`) and the per-component sheets Vue
 * imports, which Vite links ahead of the app's stylesheet when they live in
 * a shared chunk.
 */
export const LAYER_ORDER =
	'@layer properties, theme, base, components, utilities;';
