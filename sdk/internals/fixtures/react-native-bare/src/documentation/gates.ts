// #region docs:headless-gate title="use-measurement.ts"
import { useIsAllowed, useIsTrackingAllowed } from '@c15t/react-native';
import { useEffect } from 'react';

// start must return cleanup that stops this SDK's optional collection.
export const useMeasurement = (start: () => () => void) => {
	const allowed = useIsAllowed('measurement');
	useEffect(() => {
		if (allowed) {
			return start();
		}
	}, [allowed, start]);
};

// Use only for a feature that also needs platform tracking authorization.
export const useTrackingFeature = (start: () => () => void) => {
	const allowed = useIsTrackingAllowed('marketing');
	useEffect(() => {
		if (allowed) {
			return start();
		}
	}, [allowed, start]);
};
// #endregion docs:headless-gate
