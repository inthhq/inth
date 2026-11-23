'use client';

import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	replayEarlyConsentTaps,
} from '@inth/sdk/surface-actions';
import {
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import { ProviderServicesContext } from '~/context';
import {
	toSaveUISource,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { useCommittedRef } from '~/hooks/use-committed-ref';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';

/** A layout effect in the browser; nothing to run on the server. */
const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Keeps a banner tap made before hydration.
 *
 * A server-rendered banner shows long before React attaches its handlers.
 * The inline script records an accept, reject, dismiss or customize tap in
 * that gap and hides the banner. Once this component mounts, the banner's
 * own handlers work: it stops the script and records the tap when the
 * runtime has started. See `@inth/sdk/surface-actions`.
 *
 * The script is in the server HTML. A banner that hydrates keeps it, inert
 * once claimed, so hydration changes nothing in the markup. A banner React
 * renders in the browser has its handlers at once, and a script it inserts
 * would never run, so there it renders nothing.
 *
 * @param props.act - Replays the tap through the banner's own handler for
 * its action, in place of the stock surface actions. The Privacy Choices
 * prompt passes it: its choices commit through its own plan, and Customize
 * opens its options in place.
 * @internal
 */
export const EarlyTapScript = ({
	act,
}: {
	act?: (tap: EarlyConsentTap) => void;
} = {}) => {
	const { nonce } = useUIConfig();
	const hydrated = useIsHydrated();
	// Decided by the first render: hydration keeps the server's script.
	// oxlint-disable-next-line react/hook-use-state -- Read once, at mount.
	const [serverRendered] = useState(!hydrated);
	const kernel = useKernel();
	// The banner root's source, which its buttons record once hydrated.
	const uiSource = toSaveUISource(useConsentTracking().uiSource);
	const services = useCommittedRef(useContext(ProviderServicesContext));
	// The latest handler, read when the tap replays.
	const actRef = useCommittedRef(act);
	const replays = act !== undefined;
	const script = useRef<HTMLScriptElement>(null);
	// The script ran in the window of the document it was parsed into,
	// which is not this bundle's `window` when the tree renders into a frame.
	const view = useRef<Window | null>(null);
	useBrowserLayoutEffect(() => {
		view.current = script.current?.ownerDocument.defaultView ?? null;
	}, []);
	useEffect(
		() =>
			replayEarlyConsentTaps(kernel, {
				act: replays
					? (tap) => {
							actRef.current?.(tap);
						}
					: undefined,
				categories: () => services.current?.getConsentCategories(),
				started: () => services.current?.isStarted() ?? true,
				uiSource,
				view: view.current,
			}),
		[kernel, services, uiSource, replays, actRef]
	);
	if (!serverRendered) {
		return null;
	}
	return (
		<script
			ref={script}
			nonce={nonce}
			// oxlint-disable-next-line react/no-danger -- Inth's own build-time script.
			dangerouslySetInnerHTML={{ __html: EARLY_CONSENT_TAP_SCRIPT }}
		/>
	);
};
