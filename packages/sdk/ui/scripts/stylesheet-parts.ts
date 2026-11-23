/**
 * Where each component's rules sit. Names are the flat files in
 * `dist/styles/components`: `consent-surface` is the prompt shell,
 * `consent-card`, `consent-banner` and `consent-drawer` its containers,
 * `consent-expand` the options Customize opens in place, `consent-dialog`
 * the consent dialog, `manager` the preference widget and `consent-gate`
 * the ConsentGate placeholder.
 *
 * `styles.css` holds the first-paint rules, then the rules of the sheets
 * that load later, in `LATER_SHEETS` order. The order matters where two
 * rules match the same element with the same specificity: the later one
 * wins, as it does when its sheet is inserted later.
 *
 * `generate-css-entrypoints.ts` fails the build when a component is in
 * none of the lists, so a new component needs a deliberate choice.
 */

/**
 * Surfaces a first paint can show: the consent prompt in each container,
 * the dialog trigger and the ConsentGate placeholder, plus the pieces they
 * render (buttons, actions, branding, legal links), in cascade order. The
 * prompt shell comes before its containers, which override it.
 */
export const FIRST_PAINT_COMPONENTS = [
	'branding',
	'button',
	'consent-actions',
	'consent-gate',
	'legal-links',
	'panel-trigger',
	'consent-surface',
	'consent-card',
	'consent-banner',
	'consent-drawer',
] as const;

/**
 * The first-paint components split by the surface that renders them, one
 * `styles/sheets/<name>.js` each. Every first-paint component sits in
 * exactly one sheet, so no rule reaches the page twice: a repeated rule
 * would re-apply after rules that override it whenever its sheet is
 * inserted later. The button has a sheet of its own because the prompt, the
 * ConsentGate and the dialog all render it. `parts` holds the branding,
 * action-row and legal-link rules the IAB banner, the preference widget and
 * the links render. A page that renders a Card carries `tokens`, `button`,
 * `surface` and `card`, and no Banner or Drawer rule.
 *
 * Each sheet carries the component variables its rules read. The theme
 * tokens ride in the `tokens` sheet, which every surface renders first.
 */
export const SURFACE_SHEETS = {
	banner: ['consent-banner'],
	button: ['button'],
	card: ['consent-card'],
	'consent-gate': ['consent-gate'],
	drawer: ['consent-drawer'],
	parts: ['branding', 'consent-actions', 'legal-links'],
	surface: ['consent-surface'],
	trigger: ['panel-trigger'],
} as const satisfies Record<
	string,
	readonly (typeof FIRST_PAINT_COMPONENTS)[number][]
>;

/**
 * Sheets that load after the first paint, in the order `styles.css` holds
 * their rules: `widget` (the preference widget and the standalone opt-out
 * and opt-in confirmations), `expand` (the options Customize opens in place,
 * and the side Drawer's scroll area), then `dialog` (the consent dialog,
 * which renders over `expand` and reuses its `scroll` and `group` classes).
 */
// oxlint-disable-next-line sort-keys -- Keys are in cascade order.
export const LATER_SHEETS = {
	widget: [
		'accordion',
		'collapsible',
		'manager',
		'opt-out-confirmation',
		'preference-item',
		'switch',
		'tabs',
		'vendor-list',
	],
	expand: ['consent-expand'],
	dialog: ['consent-dialog'],
} as const satisfies Record<string, readonly string[]>;

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
