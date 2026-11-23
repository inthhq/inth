import { CONSENT_BOOT_ATTRIBUTE } from './consent-boot.model';
import type { ConsentBoot } from './consent-boot.model';

/**
 * Reads the boot data block.
 *
 * @param root - Where to look. Defaults to `document`.
 * @returns The boot data, or `null` without a parseable block.
 * @internal
 */
export const readConsentBoot = function readConsentBoot(
	root: ParentNode = document
): ConsentBoot | null {
	const text = root.querySelector(
		`script[${CONSENT_BOOT_ATTRIBUTE}]`
	)?.textContent;
	if (!text) {
		return null;
	}
	try {
		const boot = JSON.parse(text) as ConsentBoot;
		return boot?.s ? boot : null;
	} catch {
		return null;
	}
};
