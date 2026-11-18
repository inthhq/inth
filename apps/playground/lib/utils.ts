import { cn as baseCn } from '@inth/sdk/ui/utils';
import type { ClassValue } from '@inth/sdk/ui/utils';
import { twMerge } from 'tailwind-merge';

export const cn = function cn(...inputs: ClassValue[]) {
	return twMerge(baseCn(...inputs));
};
