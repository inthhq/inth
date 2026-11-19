// #region docs:class-names-emotion title="src/consent-components.ts"
import { css } from '@emotion/css';
import type { InthProviderOptions } from '@inth/react';

const card = css({
	border: '3px solid rgb(234 88 12)',
	borderRadius: 4,
});

/** Pass as `components` in your InthProvider options. */
export const components: InthProviderOptions['components'] = {
	banner: {
		card: { className: card },
	},
};
// #endregion docs:class-names-emotion
