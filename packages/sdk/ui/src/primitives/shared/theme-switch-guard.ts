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

/** Holds `attribute` on `root` until two frames after the latest call. */
const holdFor = function holdFor(
	root: HTMLElement,
	attribute: string
): () => void {
	root.setAttribute(attribute, '');
	const view = root.ownerDocument.defaultView;
	let cancel = nextFrame(view, () => {
		cancel = nextFrame(view, () => {
			root.removeAttribute(attribute);
		});
	});
	return () => {
		cancel();
		root.removeAttribute(attribute);
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

/**
 * Guard every theme change on `root` that someone else makes, such as the
 * SDK's own `inth-dark` class or a host's `.dark`: when its `class` or
 * `data-theme` changes, hold the attribute for two frames. A
 * `MutationObserver` runs before the next style recalculation, so the
 * first frame of the new theme already has transitions off.
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
	const observer = new MutationObserver(() => {
		release?.();
		release = holdFor(root, attribute);
	});
	observer.observe(root, {
		attributeFilter: options.attributeFilter ?? [
			'class',
			'data-theme',
			'data-color-scheme',
		],
		attributes: true,
	});
	return () => {
		observer.disconnect();
		release?.();
	};
};
