'use client';

import { PHONE_LAYOUT_QUERY } from '@inth/sdk/engine';
import { useSyncExternalStore } from 'react';

const subscribePhone = (listener: () => void) => {
	if (typeof window === 'undefined' || !window.matchMedia) {
		return () => undefined;
	}
	const query = window.matchMedia(PHONE_LAYOUT_QUERY);
	query.addEventListener('change', listener);
	return () => query.removeEventListener('change', listener);
};

const readPhone = () =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia(PHONE_LAYOUT_QUERY).matches;

/**
 * Whether the phone layout applies. The server renders desktop; the
 * browser switches after hydration, keeping every node (ARCH-01).
 *
 * @internal
 */
export const usePhoneLayout = (): boolean =>
	useSyncExternalStore(subscribePhone, readPhone, () => false);
