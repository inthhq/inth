/**
 * One `role="status"` region per modal layer (SR-01..03).
 *
 * VoiceOver ignores live regions outside an `aria-modal` subtree, so each
 * layer speaks through its own region. Opening and closing a layer clears
 * it, so closing a sheet does not re-announce the parent's last message
 * and a reopened dialog does not mount a stale one.
 *
 * @packageDocumentation
 */

/** Options for {@link attachLiveRegion}. */
export interface LiveRegionOptions {
	/** Defaults to `'polite'`. */
	politeness?: 'polite' | 'assertive';
}

/** Stops the region and clears it, and speaks through it while attached. */
export interface LiveRegion {
	(): void;
	/**
	 * Announce `message`. The same message twice still changes the text, by
	 * a toggled zero-width space, so it is read again (SR-03).
	 */
	announce: (message: string) => void;
	/** Show exactly `text`, such as the surface session's `announcementText`. */
	render: (text: string) => void;
	clear: () => void;
}

const ZERO_WIDTH_SPACE = '​';

/**
 * Make `region` its layer's status region and clear it.
 *
 * @param region - An element inside the layer, kept mounted with it.
 * @returns The region's controller; call it to clear and stop.
 */
export const attachLiveRegion = function attachLiveRegion(
	region: HTMLElement,
	options: LiveRegionOptions = {}
): LiveRegion {
	const added: string[] = [];
	const ensure = (name: string, value: string) => {
		if (!region.hasAttribute(name)) {
			region.setAttribute(name, value);
			added.push(name);
		}
	};
	ensure('role', 'status');
	ensure('aria-live', options.politeness ?? 'polite');
	ensure('aria-atomic', 'true');
	let flip = false;
	let disposed = false;
	const render = (text: string) => {
		if (!disposed && region.textContent !== text) {
			region.textContent = text;
		}
	};
	render('');
	const controller = (() => {
		render('');
		disposed = true;
		for (const name of added) {
			region.removeAttribute(name);
		}
	}) as LiveRegion;
	controller.announce = (message) => {
		flip = !flip;
		render(flip ? `${message}${ZERO_WIDTH_SPACE}` : message);
	};
	controller.render = render;
	controller.clear = () => {
		render('');
	};
	return controller;
};
