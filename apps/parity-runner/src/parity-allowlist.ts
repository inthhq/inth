/**
 * Known cross-framework drift.
 *
 * An entry here says "this difference is real, we know about it, and it is
 * not this branch's job to fix it". Every entry needs a reason a reviewer
 * can act on — a link, an issue, or the constraint that forces it. An
 * entry with a vague reason is worse than a red test, because it hides one
 * without recording why.
 *
 * Entries are keyed by check, framework, story and slot. `'*'` matches
 * everything in that position; prefer the narrowest key that covers the
 * drift, so an unrelated regression in the same story still fails.
 *
 * Nothing expires automatically. Delete an entry when the drift is fixed —
 * {@link unusedAllowlistEntries} reports entries that matched nothing, so a
 * stale allowance shows up as soon as the drift goes away.
 */

/** The checks an entry can silence. */
export type ParityCheck = 'geometry' | 'pixel' | 'dom' | 'a11y' | 'css';

/** One allowed difference. */
export interface ParityAllowEntry {
	/** Which check the allowance applies to. */
	check: ParityCheck;
	/** The framework that differs from the React baseline, or `'*'`. */
	framework: string;
	/** The paired story key (e.g. `Core/Consent Banner/Default`), or `'*'`. */
	story: string;
	/**
	 * The `data-testid` slot, or `'*'`. A trailing `*` matches a prefix
	 * (`consent-widget-accordion-trigger-*`), which is how per-category
	 * slots are covered without one entry per category. Geometry slots may
	 * carry a repeat index (`consent-widget-footer-sub-group[1]`); a bare id
	 * matches every index of that slot.
	 *
	 * The descriptive DOM, a11y and computed-style checks report one result
	 * per story rather than per element, so their entries use `'*'`.
	 */
	slot: string;
	/** Why this drift is allowed. Required; keep it specific. */
	reason: string;
}

/**
 * The one IAB allowance left, shared by every entry that carries it.
 */
const IAB_VENDOR_LIST_REASON =
	"The IAB preference centre's vendor list. Every other IAB check is clean — geometry, pixel and a11y pass with no allowance on either surface, and the banner passes all five — so what is left is the markup inside the collapsed vendor rows, which the DOM snapshot compares byte for byte even while it is closed. Two known differences remain. React sizes several icons with inline `style` where Svelte and Vue use the `legitimateInterestIcon` class, and React's vendor purpose headings carry the `role` and `focusable` attributes its icons elsewhere do not; converging them is a `packages/sdk/react` icon pass, not an adapter fix. And Vue's `iab-vendor-list.vue` is a much thinner component than React's — flat rows with no expandable detail, no legitimate-interest or custom-vendor sections — so roughly 600 lines of it have no counterpart to compare. Porting it is its own change.";

export const PARITY_ALLOWLIST: readonly ParityAllowEntry[] = [
	// ---------------------------------------------------------------------
	// Astro. Its prompt is server-rendered and progressively enhanced. The
	// hooks its client boot reads (`data-inth-action`, `data-inth-visible`
	// and the like) are normalised in `diff-dom.ts`; what is left below is
	// the server render's own output.
	// ---------------------------------------------------------------------
	{
		check: 'dom',
		framework: 'astro',
		reason:
			'Astro\'s server-rendered opt-out link marks itself `data-inth-surface="trigger"`, which React\'s `ConsentDialogLink` does not. The confirmation view matches React on DOM, accessibility, styles and geometry.',
		slot: '*',
		story: 'Core/Opt Out Confirmation/Account Adopted',
	},
	{
		check: 'dom',
		framework: 'astro',
		reason:
			'Astro\'s server-rendered opt-out link marks itself `data-inth-surface="trigger"`, which React\'s `ConsentDialogLink` does not. The confirmation view matches React on DOM, accessibility, styles and geometry.',
		slot: '*',
		story: 'Core/Opt Out Confirmation/Signal Honored',
	},
	{
		check: 'dom',
		framework: 'astro',
		reason:
			'Astro\'s server-rendered IAB banner carries the `lang` the server resolved. It also still differs from React\'s on markup the eye and the accessibility tree do not reach: its root carries `data-blocking="true"`, and its partners link the `data-inth-tab` hook its client boot reads.',
		slot: '*',
		story: 'IAB/IAB Consent Banner/Default',
	},

	// ---------------------------------------------------------------------
	// IAB. The banner is converged on every check bar the one DOM entry
	// above, for the boot attributes only Astro's server render carries. The
	// preference centre is converged everywhere the eye can reach; what is
	// left is the vendor list's collapsed internals.
	// ---------------------------------------------------------------------
	{
		check: 'dom',
		framework: 'svelte',
		reason: IAB_VENDOR_LIST_REASON,
		slot: '*',
		story: 'IAB/IAB Consent Dialog/Overview',
	},
	{
		check: 'dom',
		framework: 'astro',
		reason: IAB_VENDOR_LIST_REASON,
		slot: '*',
		story: 'IAB/IAB Consent Dialog/Overview',
	},
	{
		check: 'dom',
		framework: 'vue',
		reason: IAB_VENDOR_LIST_REASON,
		slot: '*',
		story: 'IAB/IAB Consent Dialog/Overview',
	},
	{
		check: 'dom',
		framework: 'vue',
		reason: IAB_VENDOR_LIST_REASON,
		slot: '*',
		story: 'IAB/IAB Consent Banner/Customize Flow',
	},
];

const matches = function matches(
	pattern: string,
	value: string,
	stripIndex: boolean
): boolean {
	if (pattern === '*' || pattern === value) {
		return true;
	}
	if (pattern.endsWith('*') && value.startsWith(pattern.slice(0, -1))) {
		return true;
	}
	return stripIndex && value.replace(/\[\d+\]$/u, '') === pattern;
};

/** A difference being tested against the allowlist. */
export interface ParityFinding {
	check: ParityCheck;
	framework: string;
	story: string;
	slot: string;
}

/**
 * Whether a finding is covered by an allowlist entry.
 */
export const findAllowEntry = function findAllowEntry(
	finding: ParityFinding,
	allowlist: readonly ParityAllowEntry[] = PARITY_ALLOWLIST
): ParityAllowEntry | undefined {
	return allowlist.find(
		(entry) =>
			entry.check === finding.check &&
			matches(entry.framework, finding.framework, false) &&
			matches(entry.story, finding.story, false) &&
			matches(entry.slot, finding.slot, true)
	);
};

/**
 * Entries for one check that matched nothing in a run.
 *
 * Scoped to a single check because each check runs in its own Playwright
 * test and only ever consults its own entries — a geometry run knows
 * nothing about whether the pixel entries were needed.
 *
 * Scoped to the enabled frameworks for the same reason. `PARITY_FRAMEWORKS`
 * defaults to `react,svelte`, so a full-matrix allowlist carries Vue and
 * Astro entries a default run never gets the chance to use. Reporting those
 * as stale would fail every default run and teach the reader to ignore the
 * one signal this check exists to give. A `'*'` entry is in scope whenever
 * any framework is.
 *
 * @returns Entries that can be deleted.
 */
export const unusedAllowlistEntries = function unusedAllowlistEntries(
	used: ReadonlySet<ParityAllowEntry>,
	checks: readonly ParityCheck[],
	frameworks: readonly string[],
	allowlist: readonly ParityAllowEntry[] = PARITY_ALLOWLIST
): ParityAllowEntry[] {
	const inScope = function inScope(entry: ParityAllowEntry): boolean {
		return entry.framework === '*'
			? frameworks.length > 0
			: frameworks.includes(entry.framework);
	};

	return allowlist.filter(
		(entry) =>
			checks.includes(entry.check) && inScope(entry) && !used.has(entry)
	);
};
