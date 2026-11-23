import type { ClassValue } from '@inth/sdk/ui/utils';
import { cn as baseCn } from '@inth/sdk/ui/utils';

export type { ClassValue };

/**
 * Utilizes framework-agnostic `cn` from @inth/sdk/ui.
 */
export const cnExt = function cnExt(...classes: ClassValue[]) {
	return baseCn(...classes);
};
