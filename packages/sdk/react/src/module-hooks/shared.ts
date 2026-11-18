'use client';

import type { ConsentKernel } from '@inth/sdk/engine';
import { useContext } from 'react';

import { KernelContext } from '../context';

export const useRequiredKernel = function useRequiredKernel(): ConsentKernel {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'c15t: no kernel in context. Wrap with <ConsentProvider options={...}> from @inth/react.'
		);
	}
	return kernel;
};
