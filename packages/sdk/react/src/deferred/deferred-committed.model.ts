/**
 * What a deferred root's commit path hands its engine, and what the root
 * tells the commit path. Types only, so the first-load chunk can name
 * them without carrying the commit code.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot, HydrationRecords } from '@inth/sdk/engine';
import type {
	Script,
	ScriptLoaderOptions,
} from '@inth/sdk/modules/script-loader';

import type { InthProviderOptions } from '../provider';

/**
 * A banner choice recorded before the engine loaded. The engine starts from
 * its records, and sends the save it queued.
 *
 * @internal
 */
export interface DeferredCommitted {
	/** The records the engine's kernel starts from. */
	records: Pick<HydrationRecords, 'choice' | 'subject'>;
	/** The permissions the commit announced. */
	permissions: ConsentSnapshot['effectivePermissions'];
	/**
	 * The commit started the loader for the root's `scripts`; the engine
	 * leaves them to it.
	 */
	ownsScripts: boolean;
}

/**
 * What the root's options say about recording a choice without the engine.
 * Absent when the root's engine has to record it: persistence off, a
 * consent source, a borrowed runtime.
 *
 * @internal
 */
export interface DeferredCommitConfig {
	/** `storageFor(options)`: where persistence keeps the records. */
	storageConfig?: InthProviderOptions['storageConfig'];
	/** The root's `scripts`, which the engine's loader would run. */
	scripts?: Script[];
	/** `scriptLoader.onDebug` for those scripts. */
	onDebug?: ScriptLoaderOptions['onDebug'];
	/** CSP nonce the engine's loader gives created elements. */
	nonce?: string;
	/** The root's callbacks, which the engine would call for the save. */
	callbacks?: InthProviderOptions['callbacks'];
	/**
	 * The resources this render's server start reserved, which a plain
	 * script must leave to it: `pageRender()?.starts`, read by the shell
	 * when the tap commits.
	 */
	reserved?: Readonly<Record<string, unknown>>;
}
