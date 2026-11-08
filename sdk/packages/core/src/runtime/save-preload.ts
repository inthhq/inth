/**
 * `@c15t/core/runtime/save-preload`: loads the code a consent save runs
 * before the visitor makes one.
 *
 * Recording a choice imports two code-split chunks the first time it
 * runs: persistence's write code and the save outbox's queue. Loaded at
 * the tap, they share the connection with the scripts the choice allows.
 * A host that renders its banner before the visitor acts calls this in
 * idle time after the page's largest image, so the tap downloads neither.
 *
 * @packageDocumentation
 * @internal
 */

import { pageWriterLoader } from '../modules/persistence/writer-loader';

/**
 * Loads persistence's write code and the save outbox's queue. Each loads
 * once and shares the chunk the save itself imports; a failed load is
 * retried by the save.
 *
 * @returns Settles once both have loaded or failed.
 * @internal
 */
export const preloadSavePath = async function preloadSavePath(): Promise<void> {
	await Promise.allSettled([
		pageWriterLoader.load(),
		import('../kernel/save-outbox/queue'),
	]);
};
