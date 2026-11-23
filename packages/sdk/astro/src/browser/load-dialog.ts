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

import type { InthUIAdapterName } from '../inth-options.model';
import { loadDialogAdapter, requireDialogSurface } from '../ui/register-dialog-adapter';
import type { ConsentDialogAdapter, ConsentDialogKind } from '../ui/register-dialog-adapter';
import { loadDialogStyles } from './load-dialog-styles';

/**
 * Start the island's import, and the dialog it will render when the
 * island loads it on demand (React's does). A surface that is not
 * registered, or fails to load, is left to the adapter's `mount()`, which
 * reports it.
 */
const startSurface = async function startSurface(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind
): Promise<void> {
	try {
		const surface = (await requireDialogSurface(ui)()) as {
			preloadDialog?: () => unknown;
		};
		if (kind !== 'iab') {
			await surface.preloadDialog?.();
		}
	} catch {
		// `mount()` imports it again and reports the failure.
	}
};

/**
 * Put in the sheets a dialog renders with, from their own chunk: the
 * dialog's own for the preferences dialog, and for the IAB dialog the
 * parts its banner shares. The stylesheets the integration registered for
 * the island are linked beside them.
 */
const loadSheets = async function loadSheets(
	kind: ConsentDialogKind,
	nonce: string | undefined
): Promise<void> {
	try {
		if (kind === 'iab') {
			const { insertPartsSheets } = await import('../parts/parts-sheets');
			insertPartsSheets(nonce);
			return;
		}
		const { insertDialogSheets } = await import('../parts/dialog-sheets');
		insertDialogSheets(nonce);
	} catch {
		// An unstyled dialog beats one that never opens.
	}
};

/**
 * Download everything a dialog needs, in parallel, and resolve with the
 * adapter once the adapter and the stylesheets are in.
 *
 * @param nonce - The page's CSP nonce, for the stylesheets it adds.
 * @throws {Error} When the adapter is not registered or fails to load.
 */
export const loadDialog = async function loadDialog(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined
): Promise<ConsentDialogAdapter> {
	const [adapter] = await Promise.all([
		loadDialogAdapter(ui),
		loadSheets(kind, nonce),
		loadDialogStyles(nonce, kind),
		startSurface(ui, kind),
	]);
	return adapter;
};

/**
 * Download a dialog without mounting it, including whatever the adapter's
 * own `preload()` adds.
 */
export const preloadDialogChunks = async function preloadDialogChunks(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined
): Promise<void> {
	const adapter = await loadDialog(ui, kind, nonce);
	await adapter.preload?.({ kind });
};
