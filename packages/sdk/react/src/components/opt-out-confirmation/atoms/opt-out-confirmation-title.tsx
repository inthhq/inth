'use client';

import {
resolveOptOutLink
} from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef,isValidElement } from 'react';
import type {
Ref
} from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import {
useResolvedPresentation
} from '~/hooks';

const OptOutConfirmationTitle = createForwardRef<
	HTMLHeadingElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const presentation = useResolvedPresentation();
	const optOutLink = resolveOptOutLink(translations, presentation?.optOutLink);
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			data-testid="opt-out-confirmation-title"
			id="opt-out-confirmation-title"
			slotKey="opt-out-confirmation.title"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<h2>{children ?? optOutLink.label}</h2>
			)}
		</Box>
	);
});
OptOutConfirmationTitle.displayName = 'OptOutConfirmationTitle';

export { OptOutConfirmationTitle as Title, OptOutConfirmationTitle };
