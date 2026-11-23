import styles from '@inth/sdk/ui/styles/components/consent-gate';
import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { CONSENT_GATE_SHEETS } from '../shared/consent-gate-sheets';
import { Box } from '../shared/primitives/box';
import type { BoxProps } from '../shared/primitives/box';
import { SurfaceStyles, useSurfaceSheetsReady } from '../shared/surface-styles';

const ConsentGateRoot = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => {
	// A gate the browser renders first, after a client-side navigation,
	// waits for a deferred sheet rather than paint unstyled.
	const sheetsReady = useSurfaceSheetsReady(CONSENT_GATE_SHEETS, props.noStyle);
	if (!sheetsReady) {
		return null;
	}
	return (
		<>
			<SurfaceStyles
				sheets={CONSENT_GATE_SHEETS}
				noStyle={props.noStyle}
			/>
			<Box
				ref={ref as Ref<HTMLDivElement>}
				baseClassName={styles.placeholder}
				data-testid="consent-gate-placeholder"
				slotKey="consent-gate.root"
				{...props}
			>
				{children}
			</Box>
		</>
	);
});

ConsentGateRoot.displayName = 'ConsentGateRoot';

export { ConsentGateRoot };
