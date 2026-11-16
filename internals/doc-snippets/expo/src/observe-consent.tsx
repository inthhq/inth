// #region docs:expo-observe-consent title="observe-consent.tsx"
import { useC15tBootstrap, useConsentDecision } from '@c15t/react-native';
import { Observe } from 'expo-observe';
import type { ObserveConfig } from 'expo-observe';
import { useEffect, useRef } from 'react';

// Observe.configure replaces every setting on each call. Keep all of your
// Observe options here, such as sampleRate or integrations.
const observeConfig: ObserveConfig = {};

export const ObserveConsent = (): null => {
	// pending until stored consent has loaded and the policy has resolved.
	const decision = useConsentDecision('measurement');
	// Whether this install has saved consent from an earlier launch.
	const { hasStoredSnapshot } = useC15tBootstrap();
	// Whether a decision has been read this session. Pending after that means
	// consent was reset or is being resolved again, not a launch still loading.
	const decided = useRef(false);

	useEffect(() => {
		if (decision === 'pending') {
			// At launch a returning user keeps the value the previous launch
			// saved. A new user has no grant to keep, and after a reset the old
			// grant no longer holds, so sending is off until a decision.
			if (!hasStoredSnapshot || decided.current) {
				Observe.configure({ ...observeConfig, dispatchingEnabled: false });
			}
			return;
		}
		decided.current = true;
		Observe.configure({
			...observeConfig,
			dispatchingEnabled: decision === 'granted',
		});
	}, [decision, hasStoredSnapshot]);

	return null;
};
// #endregion docs:expo-observe-consent
