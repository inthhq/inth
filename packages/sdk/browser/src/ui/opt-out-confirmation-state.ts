/**
 * Per-kernel visibility state for the opt-out confirmation view.
 *
 * Kept outside the kernel so the browser UI can show and dismiss the
 * focused confirmation view without adding a surface to `KernelActiveUI`.
 *
 * @internal
 */

import type { ConsentKernel } from '@inth/sdk-core';

interface ConfirmationEntry {
	open: boolean;
	opener: HTMLElement | null;
	listeners: Set<() => void>;
}

const entries = new WeakMap<ConsentKernel, ConfirmationEntry>();

const entryFor = function entryFor(kernel: ConsentKernel): ConfirmationEntry {
	let entry = entries.get(kernel);
	if (!entry) {
		entry = { listeners: new Set(), open: false, opener: null };
		entries.set(kernel, entry);
	}
	return entry;
};

const notify = function notify(entry: ConfirmationEntry): void {
	for (const listener of [...entry.listeners]) {
		listener();
	}
};

/**
 * Read the currently focused element, descending through open shadow roots
 * so a button inside the UI shadow root is captured accurately.
 */
export const readFocusedElement =
	function readFocusedElement(): HTMLElement | null {
		if (typeof document === 'undefined') {
			return null;
		}
		let active: Element | null = document.activeElement;
		while (active?.shadowRoot?.activeElement) {
			active = active.shadowRoot.activeElement;
		}
		return active instanceof HTMLElement &&
			active !== document.body &&
			active !== document.documentElement
			? active
			: null;
	};

/** Open the opt-out confirmation view for `kernel`. */
export const openOptOutConfirmation = function openOptOutConfirmation(
	kernel: ConsentKernel,
	opener?: HTMLElement | null
): void {
	const entry = entryFor(kernel);
	entry.opener = opener ?? readFocusedElement();
	entry.open = true;
	notify(entry);
};

/** Close the opt-out confirmation view for `kernel`. */
export const closeOptOutConfirmation = function closeOptOutConfirmation(
	kernel: ConsentKernel
): void {
	const entry = entries.get(kernel);
	if (!entry?.open) {
		return;
	}
	entry.open = false;
	notify(entry);
};

/** Whether the opt-out confirmation view is currently open for `kernel`. */
export const isOptOutConfirmationOpen = function isOptOutConfirmationOpen(
	kernel: ConsentKernel
): boolean {
	return entries.get(kernel)?.open === true;
};

/** Read and clear the element that opened the confirmation view. */
export const takeOptOutConfirmationOpener =
	function takeOptOutConfirmationOpener(
		kernel: ConsentKernel
	): HTMLElement | null {
		const entry = entries.get(kernel);
		if (!entry) {
			return null;
		}
		const { opener } = entry;
		entry.opener = null;
		return opener;
	};

/** Subscribe to opt-out confirmation open/close transitions for `kernel`. */
export const subscribeOptOutConfirmation = function subscribeOptOutConfirmation(
	kernel: ConsentKernel,
	listener: () => void
): () => void {
	const entry = entryFor(kernel);
	entry.listeners.add(listener);
	return () => {
		entry.listeners.delete(listener);
	};
};
