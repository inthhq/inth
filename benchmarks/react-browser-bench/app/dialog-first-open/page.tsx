'use client';

import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
	hosted,
	useActiveUI,
	useSetActiveUI,
} from '@inth/react';
import type { InthProviderOptions, WithProjectUrl } from '@inth/react';
import { useEffect, useRef } from 'react';

const Controls = () => {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const activeUI = useActiveUI();
	const setActiveUI = useSetActiveUI();
	useEffect(() => {
		buttonRef.current?.setAttribute('data-hydrated', 'true');
	}, []);
	return (
		<button
			ref={buttonRef}
			data-active-ui={activeUI}
			id="reopen-dialog"
			onClick={() => setActiveUI('dialog')}
			type="button"
		>
			Reopen preferences
		</button>
	);
};

const options: WithProjectUrl<InthProviderOptions> = {
	consentCategories: ['necessary', 'measurement', 'marketing'],
	mode: hosted(),
	projectUrl: '/api/bench-consent',
};

const DialogFirstOpenPage = () => (
	<InthProvider options={options}>
		<ConsentBanner />
		<ConsentDialog />
		<Controls />
	</InthProvider>
);

export default DialogFirstOpenPage;
