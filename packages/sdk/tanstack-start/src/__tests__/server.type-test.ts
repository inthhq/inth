import type { ConsentMode } from '@c15t/core/modes';
import { createServerFn } from '@tanstack/react-start';
import { expectTypeOf } from 'vitest';

import { createConsentStateHandler, resolveConsent } from '../server';
import type { ConsentState, ResolveConsentOptions } from '../server';

export const getConsentState = createServerFn({ method: 'GET' }).handler(
	createConsentStateHandler()
);
export const getRoutedConsentState = createServerFn({ method: 'GET' }).handler(
	createConsentStateHandler({ routePrefix: '/api/c15t' })
);
expectTypeOf(
	createConsentStateHandler()
).returns.resolves.toEqualTypeOf<ConsentState>();
expectTypeOf(resolveConsent).returns.resolves.toEqualTypeOf<ConsentState>();
expectTypeOf(resolveConsent)
	.parameter(0)
	.toEqualTypeOf<ResolveConsentOptions | undefined>();
expectTypeOf<ResolveConsentOptions['projectUrl']>().toEqualTypeOf<
	string | undefined
>();
expectTypeOf<ConsentState['mode']>().toEqualTypeOf<ConsentMode | undefined>();
