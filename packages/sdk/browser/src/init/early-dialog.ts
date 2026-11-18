/**
 * The preference dialog the init script (`c15t.js`) opens before the
 * engine, in `c15t.dialog.js`.
 *
 * It renders the stock dialog against the init script's stand-in: the
 * stand-in's snapshot, its accept and reject (recorded without the engine
 * when they can be), and the save and close the init script passes. Every
 * call goes through the stand-in, so once the engine has taken over, the
 * same dialog talks to the engine. {@link EarlyDialog.handOver} then gives
 * it to the engine's UI.
 *
 * In `c15t.dialog.js`, not `c15t.js`: the init script carries only the
 * hooks.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk-core';

import { stylesheet } from '../generated/dialog-styles';
import type { C15tGlobalBase } from '../global-base';
import type { ConsentClient, ScriptTagClientOptions } from '../types';
import { createDialog } from '../ui/dialog';
import { prefersReducedMotion } from '../ui/dom';
import { createStyle } from '../ui/root';
import type { Surface } from '../ui/surface';
import type { InitUI } from './boot';

/** What the init script hands the dialog. @internal */
export interface EarlyDialogHost {
	/** The stand-in `window.c15t`. */
	standIn: Pick<C15tGlobalBase, 'getSnapshot' | 'subscribe'> & {
		acceptAll: () => unknown;
		rejectAll: () => unknown;
	};
	/** Saves the dialog's input: without the engine when it can. */
	save: (input: Record<string, unknown>) => unknown;
	/** Closes the dialog. */
	closeDialog: () => unknown;
	/** The presentation options the dialog's actions follow. */
	presentation: () => ConsentClient['presentation'];
	/** The init script's options. */
	options: ScriptTagClientOptions;
	/** The init script's UI root. */
	ui: InitUI;
}

/** The dialog the init script opened. @internal */
export interface EarlyDialog {
	/** The dialog surface; the init script syncs it with its snapshot. */
	surface: Surface;
	/**
	 * The dialog for the engine's UI, rendered from `rendered`: it stays
	 * open until the engine's snapshot shows it, and takes the init
	 * script's references for parts of the engine's snapshot that hold the
	 * same values, so it does not render again and keeps what the visitor
	 * staged. The dialog sheet goes; the engine's root holds the full one.
	 */
	handOver: (rendered: ConsentSnapshot, client: ConsentClient) => Surface;
}

/** Snapshot parts the dialog compares by reference before it re-renders. */
const RENDERED_FROM = [
	'branding',
	'experiment',
	'policyRule',
	'translations',
	'vendorChoice',
	'vendors',
] as const;

/**
 * Create the dialog in the init script's UI root. It opens on the first
 * snapshot whose `activeUI` is `dialog`.
 *
 * @param host - The init script's hooks.
 * @returns The dialog.
 * @internal
 */
export const openEarlyDialog = function openEarlyDialog(
	host: EarlyDialogHost
): EarlyDialog {
	const { options, standIn, ui } = host;
	// After the banner's sheet, which lacks the dialog's rules.
	const style = createStyle(stylesheet, options.nonce);
	ui.root.append(style);
	const uiOptions = options.ui || {};
	const client = {
		acceptAll: () => standIn.acceptAll(),
		closeDialog: host.closeDialog,
		getSnapshot: () => standIn.getSnapshot(),
		kernel: {
			commands: { save: host.save },
			getSnapshot: () => standIn.getSnapshot(),
			subscribe: (listener: (next: ConsentSnapshot) => void) =>
				standIn.subscribe(listener),
		},
		get presentation() {
			return host.presentation();
		},
		rejectAll: () => standIn.rejectAll(),
		save: host.save,
	} as unknown as ConsentClient;
	const surface = createDialog(
		{
			client,
			disableAnimation: uiOptions.disableAnimation ?? prefersReducedMotion(),
			legalLinks: options.legalLinks,
			noStyle: false,
			root: ui.themeRoot,
			slot: (element) => element,
		},
		typeof uiOptions.dialog === 'object' ? uiOptions.dialog : {}
	);
	return {
		handOver(rendered, engine) {
			style.remove();
			let holding = true;
			const same = (next: ConsentSnapshot): ConsentSnapshot => {
				const kept: Partial<Record<keyof ConsentSnapshot, unknown>> = {};
				for (const key of RENDERED_FROM) {
					if (
						next[key] !== rendered[key] &&
						JSON.stringify(next[key]) === JSON.stringify(rendered[key])
					) {
						kept[key] = rendered[key];
					}
				}
				return { ...next, ...kept } as ConsentSnapshot;
			};
			const sync = (next: ConsentSnapshot): void => {
				holding = false;
				surface.sync(same(next));
			};
			// The engine's queued `openDialog` runs once it is ready; should it
			// not show the dialog, the dialog follows the engine from then on.
			const release = () => {
				setTimeout(() => {
					if (holding) {
						sync(engine.getSnapshot());
					}
				}, 0);
			};
			// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
			void engine.ready().then(release, release);
			return {
				destroy: () => surface.destroy(),
				sync(next) {
					if (!holding || next.activeUI === 'dialog') {
						sync(next);
					}
				},
			};
		},
		surface,
	};
};
