import type { ConsentProviderOptions } from '@inth/react';
import type { KernelConfig } from '@inth/sdk/engine';
import type { ComponentType, ReactNode } from 'react';

/**
 * Props exercised by the shared framework integration suites: each
 * framework's `ConsentRoot` takes the visitor's resolved `state`.
 */
export type FrameworkRoot = ComponentType<{
	state: KernelConfig;
	persistence?: ConsentProviderOptions['persistence'];
	options?: ConsentProviderOptions;
	children: ReactNode;
}>;
