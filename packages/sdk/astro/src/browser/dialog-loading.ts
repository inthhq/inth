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

import type { ConsentSnapshot } from '@inth/sdk/engine';

import type { DesignOptions } from '../privacy-choices/design';
import type { InthUIAdapterName } from '../types';
import { loadDialogAdapter, requireDialogSurface } from '../ui/adapter';
import type { ConsentDialogAdapter, ConsentDialogKind } from '../ui/adapter';
import { loadDialogStyles } from './dialog-styles';

/**
 * Start the island's import, and the one preference dialog it will
 * render when the island loads its dialogs on demand (React's does). A
 * surface that is not registered, or fails to load, is left to the
 * adapter's `mount()`, which reports it.
 */
const startSurface = async function startSurface(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	design: DialogDesign | Promise<DialogDesign>
): Promise<void> {
	try {
		const surface = (await requireDialogSurface(ui)()) as {
			preloadDialog?: (design: DialogDesign) => unknown;
		};
		if (kind !== 'iab') {
			await surface.preloadDialog?.(await design);
		}
	} catch {
		// `mount()` imports it again and reports the failure.
	}
};

/** The preference dialog an island renders. */
type DialogDesign = 'classic' | 'privacy-choices';

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

/**
 * Which dialog an open would mount, read before the engine has loaded,
 * from the snapshot the server rendered. Only an island with a Privacy
 * Choices dialog asks: the design's resolver is a chunk of its own, so a
 * page that cannot render that dialog never downloads it.
 *
 * @internal
 */
export const resolveDialogDesign = function resolveDialogDesign(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	snapshot: ConsentSnapshot,
	options: DesignOptions
): DialogDesign | Promise<DialogDesign> {
	if (kind !== 'preferences' || !PRIVACY_CHOICES_DIALOG_ADAPTERS.has(ui)) {
		return 'classic';
	}
	return (async () => {
		const { usesPrivacyChoices } = await import('../privacy-choices/design');
		return dialogDesignFor(ui, kind, usesPrivacyChoices(snapshot, options));
	})();
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
 * stylesheets, or a promise of it while the page's design resolves. The
 * Privacy Choices dialog links no classic sheet.
 * @throws {Error} When the adapter is not registered or fails to load.
 */
export const loadDialog = async function loadDialog(
	ui: InthUIAdapterName,
	kind: ConsentDialogKind,
	nonce: string | undefined,
	design: DialogDesign | Promise<DialogDesign> = 'classic'
): Promise<ConsentDialogAdapter> {
	const surface = startSurface(ui, kind, design);
	const stylesFor = (resolved: DialogDesign): Promise<void> =>
		resolved === 'privacy-choices'
			? loadPrivacyChoicesDialogStyles(nonce)
			: loadDialogStyles(nonce, kind);
	// The adapter and the island do not depend on the design, so they
	// start at once; only the stylesheets and the one dialog wait for it.
	const [adapter] = await Promise.all([
		loadDialogAdapter(ui),
		typeof design === 'string' ? stylesFor(design) : design.then(stylesFor),
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
	nonce: string | undefined,
	design: 'classic' | 'privacy-choices' = 'classic'
): Promise<void> {
	const adapter = await loadDialog(ui, kind, nonce, design);
	await adapter.preload?.({ design, kind });
};
