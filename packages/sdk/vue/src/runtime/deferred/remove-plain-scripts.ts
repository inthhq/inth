/**
 * Removing the plain scripts a deferred context started before the
 * consent engine loaded. Deciding and inserting them is core's
 * (`@inth/sdk/surface-actions/plain-scripts`).
 *
 * @packageDocumentation
 * @internal
 */

import type { Script } from '@inth/sdk/modules/script-loader';
import { startedElements } from '@inth/sdk/runtime/page-globals';
import { isPlainScript } from '@inth/sdk/surface-actions/plain-scripts';

/**
 * Removes the elements `startPlainScripts` inserted for `scripts`, for a
 * registration disposed or changed before a loader adopted them. An
 * element a loader owns, or one another script inserted, stays. So does
 * one the first plain script in `kept` for that resource would insert the
 * same way (the same `src`), as the loader mounts the first entry for a
 * key; a survivor with another `src`, or one the loader runs differently
 * (callbacks, a vendor), gets its own from the loader. A script that asks
 * to `persistAfterDispose` keeps its element, as it would under the
 * loader.
 *
 * @param kept - The scripts the page still wants.
 * @internal
 */
export const removePlainScripts = function removePlainScripts(
	scripts: readonly Script[],
	kept: readonly Script[] = []
): void {
	const started = startedElements();
	if (!started) {
		return;
	}
	// The first plain survivor for a key is the one the loader mounts.
	const keptSrcByKey = new Map<string, string | undefined>();
	for (const script of kept) {
		const key = script.resourceKey ?? script.id;
		if (isPlainScript(script) && !keptSrcByKey.has(key)) {
			keptSrcByKey.set(key, script.src);
		}
	}
	for (const script of scripts) {
		const key = script.resourceKey ?? script.id;
		const element = started[key];
		if (
			!element ||
			element.__inthAdopted ||
			element.__inthScript !== script.id ||
			script.persistAfterDispose === true ||
			keptSrcByKey.get(key) === script.src
		) {
			continue;
		}
		element.remove();
		// oxlint-disable-next-line typescript/no-dynamic-delete -- The registry is a plain object shared with core's loader, keyed by resource.
		delete started[key];
	}
};
