/**
 * What the init script (`c15t.js`) hands the engine (`c15t.hosted.js`).
 *
 * The init script installs a stand-in `window.c15t` that carries this
 * object under {@link BOOT_KEY}. The engine finds it there when it
 * installs the real API: it reads the init tag's options from it, replays
 * the calls the page made in the meantime, adopts the banner the init
 * script rendered, and starts from the choice the init script stored.
 *
 * Types and a key only, so both bundles can name it without carrying the
 * other's code.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentSnapshot,
	KernelConfig,
	KernelOverrides,
} from '@c15t/core';
import type { readStoredRecords } from '@c15t/core/modules/persistence';
import type {
	planEarlyCommit,
	storeEarlyCommit,
} from '@c15t/core/surface-actions/early-commit';

import type { C15tGlobalBase, QueuedCall } from '../global-base';
import type { ConsentClient } from '../types';
import type { Surface } from '../ui/surface';

/** Property of the stand-in `window.c15t` that holds the {@link InitBoot}. */
export const BOOT_KEY = '__c15tBoot';

/** A banner element the engine's banner takes over. @internal */
export interface AdoptedBanner {
	/** The banner root on screen. */
	element: HTMLElement;
	/** Its backdrop, when the banner locks scrolling. */
	overlay: HTMLElement | null;
	/** Releases the focus trap and scroll lock the init script set up. */
	release: () => void;
}

/**
 * The preference dialog the init script opened before the engine, for the
 * engine's UI to take over. @internal
 */
export interface AdoptedDialog {
	/**
	 * Hands the open dialog to `client`. The surface it returns stays open
	 * until the client's snapshot shows the dialog, so the engine's first
	 * render, before its queued `openDialog` runs, does not close it.
	 */
	adopt: (client: ConsentClient) => Surface;
	/** Removes the dialog and releases its scroll lock and focus trap. */
	destroy: () => void;
}

/** The UI root the init script mounted, for the engine to reuse. @internal */
export interface InitUI {
	/** The `[data-c15t-ui]` host element. */
	host: HTMLElement;
	/** Its shadow root, or the host in light-DOM mode. */
	root: ShadowRoot | HTMLElement;
	/** The `<style>` holding the banner's sheet. */
	style: HTMLStyleElement | null;
	/** The `.c15t-host` wrapper. */
	wrapper: HTMLElement;
	/** The `.c15t-theme-root` surfaces render into. */
	themeRoot: HTMLElement;
	/** Stops following the colour scheme. */
	releaseScheme: () => void;
	/**
	 * Stops the init script's banner and hands over its elements, or
	 * `null` when none is on screen. Call once.
	 */
	takeBanner: () => AdoptedBanner | null;
	/**
	 * Hands over the dialog the init script opened, or `null` when none is
	 * open. Call once.
	 */
	takeDialog: () => AdoptedDialog | null;
}

/** A banner choice the init script recorded before the engine. @internal */
export interface InitCommit {
	/** The snapshot after the choice. */
	snapshot: ConsentSnapshot;
	/**
	 * Settles once the save is queued in the outbox, with whether it was.
	 * `null` until the record is written, which the engine forces by
	 * attaching.
	 */
	queued: Promise<boolean> | null;
}

/**
 * What `c15t.commit.js` hands the init script: core's code to store an
 * early choice and queue its save. @internal
 */
export interface InitCommitPart {
	name: 'commit';
	planEarlyCommit: typeof planEarlyCommit;
	storeEarlyCommit: typeof storeEarlyCommit;
	/** The package version the file was built from. */
	version: string;
}

/**
 * What `c15t.records.js` hands the init script: core's reader for a
 * returning visitor's stored records. @internal
 */
export interface InitRecordsPart {
	name: 'records';
	readStoredRecords: typeof readStoredRecords;
	/** The package version the file was built from. */
	version: string;
}

/** A file the init script fetches when it needs it. @internal */
export type InitPart = InitCommitPart | InitRecordsPart;

/** The handoff object. @internal */
export interface InitBoot {
	/** The init script's package version. */
	version: string;
	/** The init script's tag, for its `data-*` options. */
	script: Element | null;
	/**
	 * Calls the page made before the engine, in order, plus those the init
	 * script queued for it, such as an accept it could not record itself.
	 */
	calls: QueuedCall[];
	/** The UI the init script mounted, until the engine takes it. */
	ui: InitUI | null;
	/** The choice the init script recorded, if any. */
	commit: InitCommit | null;
	/**
	 * The `/init` answer the init script read, as a runtime `prefetch`, and
	 * the request it answered. The engine starts from it instead of sending
	 * `/init` again when its own options send the same request.
	 */
	prefetch: {
		projectUrl: string;
		overrides: KernelOverrides | undefined;
		config: KernelConfig;
	} | null;
	/**
	 * The page called `dispose()` on the stand-in before the engine
	 * attached. The init script stops its listeners and timers, and an
	 * engine that still arrives installs itself without initialising, until
	 * the page calls `init()` again.
	 */
	disposed: boolean;
	/**
	 * Settles once the init script has read its `/init` answer, or gave up
	 * waiting. The engine takes over after it, so it starts from that
	 * answer. `null` when no request is in flight.
	 */
	settled: Promise<void> | null;
	/** Called by `c15t.commit.js` and `c15t.records.js` when they run. */
	provide: (part: InitPart) => void;
	/**
	 * Called by the engine once `window.c15t` is the real API. The init
	 * script stops its own listeners and forwards every later call.
	 */
	attach: (api: C15tGlobalBase) => void;
}

/** The stand-in `window.c15t`, as far as the engine reads it. @internal */
export interface InitStandIn {
	[BOOT_KEY]: InitBoot;
}

/**
 * The init script's handoff, when `window.c15t` is its stand-in.
 *
 * @returns The boot object, or `undefined`.
 * @internal
 */
export const readBoot = function readBoot(): InitBoot | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	const current = (window as unknown as { c15t?: unknown }).c15t;
	return current !== null && typeof current === 'object' && BOOT_KEY in current
		? (current as InitStandIn)[BOOT_KEY]
		: undefined;
};
