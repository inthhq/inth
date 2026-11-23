import type { AstroConsentClient } from '../astro-consent-client.model';
import type { ConsentDialogKind } from '../ui/register-dialog-adapter';
import { preloadDialogChunks } from './load-dialog';
import { readPageNonce } from './read-page-nonce';
import { readDeferredClientHooks } from './register-deferred-client';

/**
 * The dialog an open would mount for `client`: the IAB preference centre
 * under an IAB policy, else the preferences dialog.
 *
 * @internal
 */
export const warmDialogTarget = function warmDialogTarget(
	client: AstroConsentClient
): { kind: ConsentDialogKind } {
	return {
		kind: client.getConsent().model === 'iab' ? 'iab' : 'preferences',
	};
};

/** A dialog warm-up in flight or done, so repeated hovers cost nothing. */
let warming: Promise<void> | null = null;

/** Forget the warm-up, so the next intent downloads again. @internal */
export const resetDialogWarming = function resetDialogWarming(): void {
	warming = null;
};

/**
 * Download the dialog for `client` without mounting it. A failed download
 * is forgotten, so the next hover, focus or open tries again.
 *
 * @returns Resolves once the download settles.
 * @internal
 */
export const warmDialog = function warmDialog(
	client: AstroConsentClient
): Promise<void> {
	readDeferredClientHooks(client)?.warm();
	if (!warming) {
		const attempt = (async () => {
			try {
				const { kind } = warmDialogTarget(client);
				await preloadDialogChunks(client.options.ui, kind, readPageNonce());
			} catch {
				// The open reports its own failure.
				warming = null;
			}
		})();
		warming = attempt;
	}
	return warming;
};
