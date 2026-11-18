/**
 * Downloading a dialog: the adapter, the island and its stylesheets, all
 * started together. Small, for the first-load chunk.
 *
 * The adapter's `mount()` imports the island, so loading the adapter first
 * and letting it ask for the island would cost one round trip per step.
 * Starting the island's import beside the adapter's turns the steps into
 * one wave: each `import()` brings its chunk's static imports with it.
 *
 * @internal
 */

import type { InthUIAdapterName } from '../types';
import { loadDialogAdapter, requireDialogSurface } from '../ui/adapter';
import type { ConsentDialogAdapter, ConsentDialogKind } from '../ui/adapter';
import { loadDialogStyles } from './dialog-styles';

/**
 * Start the island's import. A surface that is not registered, or fails to
 * load, is left to the adapter's `mount()`, which reports it.
 */
const startSurface = async function startSurface(
	ui: InthUIAdapterName
): Promise<void> {
	try {
		await requireDialogSurface(ui)();
	} catch {
		// `mount()` imports it again and reports the failure.
	}
};

/**
 * Download everything a dialog needs, in parallel, and resolve with the
 * adapter once the adapter and the stylesheets are in.
 *
 * @param ui - The configured adapter.
 * @param kind - Which dialog.
 * @param nonce - The page's CSP nonce, for the stylesheet links.
 * @returns The adapter.
 * @throws {Error} When the adapter is not registered or fails to load.
 */
export const loadDialog = async function loadDialog(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined
): Promise<ConsentDialogAdapter> {
	const surface = startSurface(ui);
	const [adapter] = await Promise.all([
		loadDialogAdapter(ui),
		loadDialogStyles(nonce, kind),
		surface,
	]);
	return adapter;
};

/**
 * Download a dialog without mounting it, including whatever the adapter's
 * own `preload()` adds.
 *
 * @param ui - The configured adapter.
 * @param kind - Which dialog.
 * @param nonce - The page's CSP nonce.
 */
export const preloadDialogChunks = async function preloadDialogChunks(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined
): Promise<void> {
	const adapter = await loadDialog(ui, kind, nonce);
	await adapter.preload?.();
};
