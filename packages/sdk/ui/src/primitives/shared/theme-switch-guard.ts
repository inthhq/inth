/**
 * Flip every surface in the same frame when the theme changes (VIS-06).
 *
 * Buttons, switches and the attribution tag animate their colours over
 * 120–150ms, while the card and the page flip at once, so a theme change
 * drifted visibly. While the guard's attribute is on the root, the
 * stylesheet turns transitions off (`[data-theme-switching] * { transition:
 * none !important }`); the guard removes it two frames later.
 *
 * @packageDocumentation
 */

/** The attribute the stylesheet keys its transition reset on. */
export const THEME_SWITCHING_ATTRIBUTE = 'data-theme-switching';

/** Options for the theme switch guard. */
export interface ThemeSwitchGuardOptions {
	/** Defaults to `document.documentElement`. */
	root?: HTMLElement;
	/** Defaults to {@link THEME_SWITCHING_ATTRIBUTE}. */
	attribute?: string;
}

const nextFrame = (view: Window | null, run: () => void): (() => void) => {
	if (view && typeof view.requestAnimationFrame === 'function') {
		const frame = view.requestAnimationFrame(run);
		return () => view.cancelAnimationFrame(frame);
	}
	const timer = setTimeout(run, 16);
	return () => clearTimeout(timer);
};

interface Hold {
	cancel: () => void;
}

/**
 * The hold in force per root and attribute. Overlapping switches share one
 * hold, so an earlier switch's frames never remove the attribute a later
 * one still needs.
 */
const holds = new WeakMap<HTMLElement, Map<string, Hold>>();

/** Holds `attribute` on `root` until two frames after the latest call. */
const holdFor = function holdFor(
	root: HTMLElement,
	attribute: string
): () => void {
	let byAttribute = holds.get(root);
	if (!byAttribute) {
		byAttribute = new Map();
		holds.set(root, byAttribute);
	}
	const active = byAttribute;
	// A newer switch restarts the two frames from now.
	active.get(attribute)?.cancel();
	root.setAttribute(attribute, '');
	const view = root.ownerDocument.defaultView;
	const hold: Hold = { cancel: () => undefined };
	const end = function end(): void {
		if (active.get(attribute) === hold) {
			active.delete(attribute);
			root.removeAttribute(attribute);
		}
	};
	hold.cancel = nextFrame(view, () => {
		hold.cancel = nextFrame(view, end);
	});
	active.set(attribute, hold);
	return () => {
		// A later switch owns the attribute now; leave it to that one.
		if (active.get(attribute) === hold) {
			hold.cancel();
			end();
		}
	};
};

/**
 * Switch the theme with transitions off: set the attribute, run `apply`,
 * commit the new styles, and remove the attribute two frames later.
 *
 * @returns Cancels the pending removal and removes the attribute now.
 */
export const switchThemeWithoutTransitions =
	function switchThemeWithoutTransitions(
		apply: () => void,
		options: ThemeSwitchGuardOptions = {}
	): () => void {
		const root = options.root ?? document.documentElement;
		const release = holdFor(
			root,
			options.attribute ?? THEME_SWITCHING_ATTRIBUTE
		);
		apply();
		// Read layout so the new theme is styled while transitions are off.
		void root.offsetHeight;
		return release;
	};

/** Classes that select a theme on the root. */
const THEME_CLASSES = ['dark', 'inth-dark', 'light'] as const;

const themeClasses = (value: string | null): string =>
	THEME_CLASSES.filter((name) =>
		(value ?? '').split(/\s+/u).includes(name)
	).join(' ');

/**
 * Whether a batch of attribute mutations changed the theme. For `class`
 * only the theme classes count, so a host toggling an unrelated class on
 * `<html>` (a scroll lock, a route marker) never turns transitions off.
 * The first record per attribute holds the value before the batch.
 */
const themeChanged = function themeChanged(
	root: HTMLElement,
	records: readonly MutationRecord[]
): boolean {
	const seen = new Set<string>();
	for (const record of records) {
		const name = record.attributeName;
		if (name === null || seen.has(name)) {
			continue;
		}
		seen.add(name);
		const now = root.getAttribute(name);
		if (
			name === 'class'
				? themeClasses(record.oldValue) !== themeClasses(now)
				: record.oldValue !== now
		) {
			return true;
		}
	}
	return false;
};

/**
 * Guard every theme change on `root` that someone else makes, such as the
 * SDK's own `inth-dark` class or a host's `.dark`: when a theme class
 * (`dark`, `inth-dark`, `light`), `data-theme` or `data-color-scheme`
 * changes, hold the attribute for two frames. A `MutationObserver` runs
 * before the next style recalculation, so the first frame of the new theme
 * already has transitions off.
 *
 * @returns Stops watching.
 */
export const attachThemeSwitchGuard = function attachThemeSwitchGuard(
	options: ThemeSwitchGuardOptions & { attributeFilter?: string[] } = {}
): () => void {
	const root = options.root ?? document.documentElement;
	const attribute = options.attribute ?? THEME_SWITCHING_ATTRIBUTE;
	if (typeof MutationObserver === 'undefined') {
		return () => undefined;
	}
	let release: (() => void) | null = null;
	const observer = new MutationObserver((records) => {
		if (themeChanged(root, records)) {
			release = holdFor(root, attribute);
		}
	});
	observer.observe(root, {
		attributeFilter: options.attributeFilter ?? [
			'class',
			'data-theme',
			'data-color-scheme',
		],
		attributeOldValue: true,
		attributes: true,
	});
	return () => {
		observer.disconnect();
		release?.();
	};
};
