import type { AllConsentNames } from '@inth/sdk/engine';
import styles from '@inth/sdk/ui/styles/components/consent-gate';
import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { resolveConsentGateCopy } from '~/component-hooks/use-consent-gate';
import { useTranslations } from '~/component-hooks/use-translations';

import { Box } from '../shared/primitives/box';
import type { BoxProps } from '../shared/primitives/box';

const ConsentGateTitle = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'> & { category?: AllConsentNames }
>(({ children, category, ...props }, ref) => {
	const translations = useTranslations();
	const defaultTitle = category
		? resolveConsentGateCopy(translations, category).title
		: undefined;

	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			data-testid="consent-gate-title"
			slotKey="consent-gate.title"
			{...props}
		>
			{children ?? defaultTitle}
		</Box>
	);
});

ConsentGateTitle.displayName = 'ConsentGateTitle';

export { ConsentGateTitle };
