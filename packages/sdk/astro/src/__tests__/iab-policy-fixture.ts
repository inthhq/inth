import { MINIMAL_GVL } from '@inth/conformance/fixtures/gvl';
import { deferInitGvl } from '@inth/sdk/engine';

import { hosted as hostedMode } from '../mode';
import type { InthAstroOptions } from '../types';
import { testWire } from './policy-fixture';

/**
 * What a backend answers for a policy that uses the `iab` model: the
 * policy plus its vendor list and CMP ID.
 *
 * @param gvl - `'inline'` sends the list itself; `'reference'` sends the
 * reference Inth's own init routes send in its place; `'null'` turns IAB
 * off for the request.
 * @returns A fresh `/init` response.
 */
export const iabInitResponse = function iabInitResponse(
	gvl: 'inline' | 'reference' | 'null' = 'inline'
): Response {
	const body = {
		branding: 'inth',
		cmpId: 28,
		gvl: gvl === 'null' ? null : MINIMAL_GVL,
		location: { countryCode: null, regionCode: null },
		policyResolution: testWire({ categories: ['marketing'], model: 'iab' }),
		translations: { language: 'en', translations: {} },
	};
	return Response.json(
		gvl === 'reference'
			? deferInitGvl(body as never, 'https://consent.example.com/gvl')
			: body
	);
};

/** A hosted site that never set `iab`, with one marketing script. */
export const SITE_WITHOUT_IAB: InthAstroOptions = {
	consentCategories: ['necessary', 'marketing'],
	mode: hostedMode(),
	projectUrl: 'https://consent.example.com',
	scripts: [
		{ category: 'marketing', id: 'pixel', src: 'https://example.com/pixel.js' },
	],
};
