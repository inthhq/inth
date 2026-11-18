// #region docs:optional-feature
import { useConsent } from '@inth/react';

export const OptionalFeature = () => {
	const allowed = useConsent('marketing');
	return allowed ? <div>Optional marketing content</div> : null;
};
// #endregion docs:optional-feature
