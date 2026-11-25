/**
 * Loading a script-tag file that publishes what it holds on a window key,
 * such as `inth.dialog.js` or `inth.manifests.js`, and checking it came from
 * the same release.
 *
 * @packageDocumentation
 * @internal
 */

import { version } from '../version';

/** What every such file publishes next to its code. */
export interface PartFile {
	/** The package version the file was built from. */
	version: string;
}

const published = <File extends PartFile>(key: string): File | undefined => {
	const file = (window as unknown as Record<string, File | undefined>)[key];
	// A file from another release may not match this bundle.
	return file?.version === version ? file : undefined;
};

const loads = new Map<string, Promise<PartFile | undefined>>();

/**
 * Load the file at `src`, once per URL, unless a file from this release
 * has published on `key` already.
 *
 * @returns What the file published, or `undefined` when it failed to load,
 * did not publish, or came from another release. A failed load is tried
 * again on the next call.
 * @internal
 */
export const loadPartFile = function loadPartFile<File extends PartFile>(
	key: string,
	src: string,
	nonce?: string
): Promise<File | undefined> {
	const ready = published<File>(key);
	if (ready) {
		return Promise.resolve(ready);
	}
	let pending = loads.get(src);
	if (!pending) {
		// oxlint-disable-next-line promise/avoid-new -- Settled by the script element.
		pending = new Promise((resolve) => {
			const element = document.createElement('script');
			element.src = src;
			if (nonce) {
				element.nonce = nonce;
			}
			const settle = () => {
				const file = published(key);
				if (!file) {
					loads.delete(src);
				}
				resolve(file);
			};
			element.addEventListener('load', settle);
			element.addEventListener('error', settle);
			document.head.append(element);
		});
		loads.set(src, pending);
	}
	return pending as Promise<File | undefined>;
};
