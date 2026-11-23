/**
 * The boot data the SvelteKit `InthProvider` leaves in the server HTML, and the
 * browser side that reads it back. The writer is in `plan-server-boot.ts`, so
 * the first-load chunk carries only the reader.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentExperiment, ConsentSnapshot } from '@inth/sdk/engine';

/** Attribute on the `<script type="application/json">` element. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-inth-boot';

/** What the server leaves. Short keys: it travels in every page. @internal */
export interface RootBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/** `1` when the engine may wait for the page (see `plan-server-boot.ts`). */
	d?: 1;
	/** The experiment the server's runtime assigned from, when there is one. */
	x?: ConsentExperiment;
	/**
	 * `1` when `s.iab.gvl` was left out because it is the state's
	 * `initialIab.gvl`, which the page already carries.
	 */
	g?: 1;
}

/** A boot read from the page, with the markup to hydrate it with. @internal */
export interface ReadBoot {
	boot: RootBoot;
	/** The element's markup, as the server rendered it. */
	html: string;
}

/**
 * The element's markup: what the server renders after the root's children,
 * and what the browser renders over it, so hydration adopts it unchanged.
 *
 * @param json - The boot, as JSON with `<` escaped.
 * @internal
 */
export const bootMarkup = (json: string): string =>
	`<script type="application/json" ${CONSENT_BOOT_ATTRIBUTE}>${json}</script>`;

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
