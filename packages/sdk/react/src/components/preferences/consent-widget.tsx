'use client';

import { useState } from 'react';

import type { AccordionRootProps } from '~/components/shared/ui/accordion';
import { BrandingTag } from '~/components/shared/ui/branding';
import { useTheme } from '~/hooks/use-theme';

import {
	ConsentWidgetAccordion,
	ConsentWidgetAccordionItems,
} from './atoms/accordion';
import { ConsentWidgetOptOut } from './atoms/opt-out';
import { ConsentWidgetRoot } from './atoms/root';
import { ConsentWidgetPolicyActions } from './policy-actions';
import type { ConsentWidgetProps } from './types';

export const ConsentWidget = ({
	hideBranding,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	...props
}: ConsentWidgetProps) => {
	const [openItem, setOpenItem] = useState('');

	const globalTheme = useTheme();

	const mergedProps = {
		disableAnimation: localDisableAnimation ?? globalTheme.disableAnimation,
		noStyle: localNoStyle ?? globalTheme.noStyle,
		scrollLock: localScrollLock ?? globalTheme.scrollLock,
		trapFocus: localTrapFocus ?? globalTheme.trapFocus,
		...props,
	};

	return (
		<ConsentWidgetRoot {...mergedProps}>
			<ConsentWidgetOptOut />
			<ConsentWidgetAccordion
				type="single"
				value={openItem}
				onValueChange={(value: NonNullable<AccordionRootProps['value']>) => {
					setOpenItem(Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));
				}}
			>
				<ConsentWidgetAccordionItems />
			</ConsentWidgetAccordion>
			<ConsentWidgetPolicyActions />
			<BrandingTag
				surface="widget"
				hideBranding={hideBranding ?? true}
			/>
		</ConsentWidgetRoot>
	);
};
