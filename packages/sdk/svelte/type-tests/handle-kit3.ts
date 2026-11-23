/**
 * SvelteKit 3 exports `Handle` only from `@sveltejs/kit/hooks`. `inthHandle()`
 * must be usable wherever Kit 3 expects one. Checked by `check-types` through
 * `tsconfig.kit3.json`.
 */
import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';

import { inthHandle } from '../src/lib/kit/inth-handle';

export const handle: Handle = inthHandle();
export const composed: Handle = sequence(inthHandle(), handle);
