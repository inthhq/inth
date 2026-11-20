import type { InthProviderOptions } from '@inth/react';
import type { KernelConfig } from '@inth/sdk/engine';
import type { ComponentType, ReactNode } from 'react';

/**
 * Props exercised by the shared framework integration suites: each
 * framework's `InthProvider` takes the visitor's resolved `state`.
 */
export type FrameworkRoot = ComponentType<{
	state: KernelConfig;
	persistence?: InthProviderOptions['persistence'];
	options?: InthProviderOptions;
	children: ReactNode;
}>;
