import { getNativeInth } from '@inth/react-native';
import { useEffect } from 'react';

import { useConsentSource } from './inth/consent-source';

const session = `${Date.now()}-${Math.random()}`;

/** Publish the real TurboModule snapshot only in the embedded E2E bundle. */
export const useE2eObserver = (): void => {
	const { kind } = useConsentSource();

	useEffect(() => {
		if (process.env.C15T_APP_E2E !== '1') {
			return;
		}

		const publish = async (): Promise<void> => {
			await fetch(
				`${process.env.C15T_E2E_URL || 'http://localhost:3000'}/e2e/state`,
				{
					body: JSON.stringify({
						bootstrap:
							kind === 'native' ? getNativeInth().getBootstrap() : null,
						core: kind,
						session,
						snapshot: kind === 'native' ? getNativeInth().getSnapshot() : null,
					}),
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				}
			).catch((error: unknown) => {
				console.error('E2E snapshot observer', error);
			});
		};

		void publish();
		const timer = setInterval(() => {
			void publish();
		}, 500);
		return () => clearInterval(timer);
	}, [kind]);
};
