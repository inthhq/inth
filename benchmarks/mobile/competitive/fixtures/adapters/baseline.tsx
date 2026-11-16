import type { PropsWithChildren } from 'react';

export const ConsentBoundary = ({ children }: PropsWithChildren) => children;
export const useSizeConsent = () => ({
	measurement: false,
	open: undefined,
	ready: true,
});
