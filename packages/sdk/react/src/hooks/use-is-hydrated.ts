'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (onStoreChange: () => void) => {
	onStoreChange();
	return () => undefined;
};

const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns true after the component has hydrated on the client.
 *
 * @internal
 */
export const useIsHydrated = function useIsHydrated(): boolean {
	return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
};
