// #region docs:class-names-css-modules title="src/consent-components.ts"
import type { InthProviderOptions } from '@inth/react';

import styles from './banner.module.css';

/** Pass as `components` in your InthProvider options. */
export const components: InthProviderOptions['components'] = {
	banner: {
		card: { className: styles.card },
	},
};
// #endregion docs:class-names-css-modules
