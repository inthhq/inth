// #region docs:class-names-vanilla-extract title="src/consent-components.css.ts"
import type { ConsentProviderOptions } from '@inth/react';
import { style } from '@vanilla-extract/css';

const card = style({
	border: '3px solid rgb(37 99 235)',
	borderRadius: 4,
});

/** Pass as `components` in your ConsentProvider options. */
export const components: ConsentProviderOptions['components'] = {
	banner: {
		card: { className: card },
	},
};
// #endregion docs:class-names-vanilla-extract
