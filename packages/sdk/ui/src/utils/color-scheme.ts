/**
 * The `inth-dark` class, kept in its own module so a page that only sets
 * the color scheme does not load the dialog's focus-trap and scroll-lock
 * helpers.
 */

/**
 * Manages color scheme preferences.
 *
 * Where `matchMedia` is missing, as in jsdom and a few embedded webviews,
 * `'system'` is light.
 *
 * @param colorScheme - 'light' | 'dark' | 'system'. Unset mirrors a `dark`
 * class on `<html>` into `inth-dark` as it changes.
 * @returns Cleanup function
 */
export const setupColorScheme = function setupColorScheme(
	colorScheme?: 'light' | 'dark' | 'system'
) {
	const systemDarkQuery =
		typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-color-scheme: dark)')
			: undefined;
	const defaultDarkQuery = document.documentElement.classList.contains('dark');

	const updateSystemColorScheme = (e: { matches: boolean }) => {
		document.documentElement.classList.toggle('inth-dark', e.matches);
	};

	const updateDefaultColorScheme = (mutationList: MutationRecord[]) => {
		for (const mutation of mutationList) {
			if (
				mutation.type === 'attributes' &&
				mutation.attributeName === 'class'
			) {
				const darkExists = document.documentElement.classList.contains('dark');
				document.documentElement.classList.toggle('inth-dark', darkExists);
			}
		}
	};

	const observer = new MutationObserver(updateDefaultColorScheme);

	const apply = () => {
		switch (colorScheme) {
			case 'light': {
				document.documentElement.classList.remove('inth-dark');
				break;
			}
			case 'dark': {
				document.documentElement.classList.add('inth-dark');
				break;
			}
			case 'system': {
				updateSystemColorScheme(systemDarkQuery ?? { matches: false });
				systemDarkQuery?.addEventListener('change', updateSystemColorScheme);
				break;
			}
			default: {
				document.documentElement.classList.toggle(
					'inth-dark',
					defaultDarkQuery
				);
				observer.observe(document.documentElement, { attributes: true });
				break;
			}
		}
	};

	apply();

	return () => {
		systemDarkQuery?.removeEventListener('change', updateSystemColorScheme);
		observer.disconnect();
	};
};

/**
 * Inline script that sets `inth-dark` before the first paint, for a server
 * to render in `<head>` ahead of the stylesheet. It runs unbundled, so a
 * module script's deferral cannot lose the race against the first paint.
 *
 * Only `'dark'` and `'system'` need one. Light is the absence of the class,
 * and any other value leaves the class to the site.
 *
 * @param colorScheme - The provider's color scheme.
 * @returns Script source, or an empty string when none is needed.
 */
export const buildColorSchemeScript = function buildColorSchemeScript(
	colorScheme: string | null | undefined
): string {
	if (colorScheme === 'dark') {
		return "document.documentElement.classList.add('inth-dark');";
	}
	if (colorScheme === 'system') {
		// `matchMedia` is missing in some embedded webviews, and a throw here
		// would stop the rest of the document from parsing.
		return "try{document.documentElement.classList.toggle('inth-dark',matchMedia('(prefers-color-scheme:dark)').matches)}catch(e){}";
	}
	return '';
};
