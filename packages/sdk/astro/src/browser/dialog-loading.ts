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
 * The islands that render the Privacy Choices dialog when the design opts
 * in. Another island keeps its classic dialog under that design until its
 * framework's port lands, and gets the classic stylesheets.
 *
 * @internal
 */
export const PRIVACY_CHOICES_DIALOG_ADAPTERS: ReadonlySet<InthUIAdapterName> =
	new Set<InthUIAdapterName>(['react']);

/**
 * Which dialog an island renders: the Privacy Choices one when the design
 * asks for it and the island has it, else the classic one.
 *
 * @internal
 */
export const dialogDesignFor = function dialogDesignFor(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	privacyChoices: boolean
): 'classic' | 'privacy-choices' {
	return privacyChoices &&
		kind === 'preferences' &&
		PRIVACY_CHOICES_DIALOG_ADAPTERS.has(ui)
		? 'privacy-choices'
		: 'classic';
};

/** Put the Privacy Choices dialog's sheets in, from their own chunk. */
const loadPrivacyChoicesDialogStyles =
	async function loadPrivacyChoicesDialogStyles(
		nonce: string | undefined
	): Promise<void> {
		try {
			const { insertPrivacyChoicesDialogSheets } =
				await import('../privacy-choices/dialog-sheets');
			insertPrivacyChoicesDialogSheets(nonce);
		} catch {
			// An unstyled dialog beats one that never opens.
		}
	};

/**
 * Download everything a dialog needs, in parallel, and resolve with the
 * adapter once the adapter and the stylesheets are in.
 *
 * @param nonce - The page's CSP nonce, for the stylesheet links.
 * @param design - The dialog the island renders, which decides its
 * stylesheets. The Privacy Choices dialog links no classic sheet.
 * @throws {Error} When the adapter is not registered or fails to load.
 */
export const loadDialog = async function loadDialog(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined,
	design: 'classic' | 'privacy-choices' = 'classic'
): Promise<ConsentDialogAdapter> {
	const surface = startSurface(ui);
	const [adapter] = await Promise.all([
		loadDialogAdapter(ui),
		design === 'privacy-choices'
			? loadPrivacyChoicesDialogStyles(nonce)
			: loadDialogStyles(nonce, kind),
		surface,
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
	await adapter.preload?.();
};
