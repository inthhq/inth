/**
 * The App Tracking Transparency sequence reads IAB TCF consent through the web's
 * category mapping, not a second one: the Swift constant must equal
 * `C15T_TO_IAB_PURPOSE_MAP.marketing`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { C15T_TO_IAB_PURPOSE_MAP } from '../packages/iab/src/tcf/purpose-mapping';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('ATT reads the TCF marketing purposes from the web mapping', () => {
	test('Swift iabMarketingPurposes equals C15T_TO_IAB_PURPOSE_MAP.marketing', () => {
		for (const path of [
			'native/core-swift/Sources/C15tApple/C15tTrackingConsent.swift',
			'packages/react-native/vendor/C15tApple/C15tTrackingConsent.swift',
		]) {
			const source = readFileSync(join(root, path), 'utf8');
			const declared =
				/static let iabMarketingPurposes: Set<Int> = \[(?<ids>[\d,\s]+)\]/u.exec(
					source
				)?.groups?.ids;
			expect(declared, path).toBeDefined();
			const ids = (declared ?? '')
				.split(',')
				.map((id) => Number(id.trim()))
				.toSorted((a, b) => a - b);
			expect(ids, path).toStrictEqual(
				[...C15T_TO_IAB_PURPOSE_MAP.marketing].toSorted((a, b) => a - b)
			);
		}
	});
});
