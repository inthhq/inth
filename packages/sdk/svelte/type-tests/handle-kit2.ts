/**
 * SvelteKit 2 exports `Handle` from `@sveltejs/kit`. `inthHandle()` must be
 * usable wherever Kit 2 expects one. Checked by `check-types`.
 */
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { inthHandle } from '../src/lib/kit/handle';

export const handle: Handle = inthHandle();
export const composed: Handle = sequence(inthHandle(), handle);
