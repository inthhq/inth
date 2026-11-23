/**
 * What the init script (`inth.js`) hands the engine (`inth.hosted.js`).
 *
 * The init script installs a stand-in `window.inth` that carries this
 * object under {@link BOOT_KEY}. The engine finds it there when it
 * installs the real API: it reads the init tag's options from it, replays
 * the calls the page made in the meantime, and starts from the
 * `/v1/consent/init` answer the init script read.
 *
 * Types and a key only, so both bundles can name it without carrying the
 * other's code.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelConfig, KernelOverrides } from '@inth/sdk-core';
import type { readStoredRecords } from '@inth/sdk-core/modules/persistence';

import type { GlobalApiBase, QueuedCall } from '../global-base';
import { GLOBAL_NAME } from '../global-name';

/** Property of the stand-in `window.inth` that holds the {@link InitBoot}. */
export const BOOT_KEY = '__inthBoot';

/**
 * What `inth.records.js` hands the init script: core's reader for a
 * returning visitor's stored records. @internal
 */
export interface InitRecordsPart {
	name: 'records';
	readStoredRecords: typeof readStoredRecords;
	/** The package version the file was built from. */
	version: string;
}

/** A file the init script fetches when it needs it. @internal */
export type InitPart = InitRecordsPart;

/** The handoff object. @internal */
export interface InitBoot {
	/** The init script's package version. */
	version: string;
	/** The init script's tag, for its `data-*` options. */
	script: Element | null;
	/** Calls the page made before the engine, in order. */
	calls: QueuedCall[];
	/**
	 * The `/v1/consent/init` answer the init script read, as a runtime `prefetch`, and
	 * the request it answered. The engine starts from it instead of sending
	 * `/v1/consent/init` again when its own options send the same request.
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
	 * Settles once the init script has read its `/v1/consent/init` answer, or gave up
	 * waiting. The engine takes over after it, so it starts from that
	 * answer. `null` when no request is in flight.
	 */
	settled: Promise<void> | null;
	/** Called by `inth.records.js` when it runs. */
	provide: (part: InitPart) => void;
	/**
	 * Called by the engine once `window.inth` is the real API. The init
	 * script stops its own listeners and forwards every later call.
	 */
	attach: (api: GlobalApiBase) => void;
}

/** The stand-in `window.inth`, as far as the engine reads it. @internal */
export interface InitStandIn {
	[BOOT_KEY]: InitBoot;
}

/**
 * The init script's handoff, when `window.inth` is its stand-in.
 *
 * @internal
 */
export const readBoot = function readBoot(): InitBoot | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	const current = (window as unknown as Record<string, unknown>)[GLOBAL_NAME];
	return current !== null && typeof current === 'object' && BOOT_KEY in current
		? (current as InitStandIn)[BOOT_KEY]
		: undefined;
};
