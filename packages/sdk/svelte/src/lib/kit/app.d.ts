/**
 * Ambient `App.Locals` augmentation for apps that install `inthHandle`.
 *
 * Reference it once from `src/app.d.ts`:
 *
 * ```ts
 * /// <reference types="@inth/svelte/kit/locals" />
 * ```
 *
 * Prefer the explicit form if you already own an `App.Locals` block:
 *
 * ```ts
 * import type { InthLocals } from '@inth/svelte/kit';
 *
 * declare global {
 *   namespace App {
 *     interface Locals {
 *       Inth: InthLocals;
 *     }
 *   }
 * }
 * ```
 */
import type { InthLocals } from './types';

declare global {
	namespace App {
		interface Locals {
			/** Consent context resolved once per request by `inthHandle`. */
			inth: InthLocals;
		}
	}
}

export {};
