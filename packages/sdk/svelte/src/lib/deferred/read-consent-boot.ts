/**
 * The browser side that reads back the boot data the SvelteKit `InthProvider`
 * leaves in the server HTML (its shape is in `consent-boot.model.ts`). The
 * writer is in `plan-server-boot.ts`, so the first-load chunk carries only the
 * reader.
 *
 * @packageDocumentation
 * @internal
 */

import { bootMarkup, CONSENT_BOOT_ATTRIBUTE } from './consent-boot.model';
import type { RootBoot } from './consent-boot.model';

/** A boot read from the page, with the markup to hydrate it with. @internal */
export interface ReadBoot {
	boot: RootBoot;
	/** The element's markup, as the server rendered it. */
	html: string;
}

/** Elements a root already read, so a second root does not take them. */
const taken = new WeakSet<Element>();

/**
 * Reads the boot a server render left for this root, once.
 *
 * @param gvl - The state's `initialIab.gvl`, which a boot may leave out.
 * @returns The boot, or `null` without an unread, parseable element.
 * @internal
 */
export const readConsentBoot = function readConsentBoot(
	gvl: unknown
): ReadBoot | null {
	if (typeof document === 'undefined') {
		return null;
	}
	const element = [
		...document.querySelectorAll(`script[${CONSENT_BOOT_ATTRIBUTE}]`),
	].find((candidate) => !taken.has(candidate));
	const text = element?.textContent;
	if (!(element && text)) {
		return null;
	}
	taken.add(element);
	try {
		const boot = JSON.parse(text) as RootBoot;
		if (!boot?.s) {
			return null;
		}
		if (boot.g && boot.s.iab) {
			boot.s = {
				...boot.s,
				iab: { ...boot.s.iab, gvl: (gvl ?? null) as never },
			};
		}
		return { boot, html: bootMarkup(text) };
	} catch {
		return null;
	}
};
