import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { nativeAppLabels } from '../packages/translations/src/native-app-labels';
import en from '../packages/translations/src/translations/en';

/**
 * The native IAB screens must take policy copy from the generated
 * IABCopy / IabCopy tables, so every language and the web stay in step.
 * A sentence typed into a view as a literal would drift from
 * `@c15t/translations` and skip every other language.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const UI_SOURCE_ROOTS = [
	'native/core-swift/Sources/C15tConsentUI',
	'native/core-android/c15t-consent-ui/src/main',
];

/** The copy that answers IAB policy checks P3-P9, P17, P18, P22 and P30. */
const POLICY_COPY = [
	...Object.values(en.iab.app ?? {}),
	...Object.values(nativeAppLabels.en ?? {}),
	en.iab.banner.legitimateInterestNotice,
];

/** Copy the native views carried before it moved to translations. */
const RETIRED_LITERALS = [
	'We and our partners store information on this device',
];

const MIN_FRAGMENT_LENGTH = 25;

/**
 * Short labels on the native IAB screens: every placeholder-free `iab.app`
 * value, plus the web keys the native screens reuse. A view that types one as
 * a quoted literal would show English in every language.
 */
const UI_LABELS = [
	...Object.values(en.iab.app ?? {}),
	...Object.values(nativeAppLabels.en ?? {}),
	en.iab.preferenceCenter.features.title,
	en.iab.preferenceCenter.purposeItem.legitimateInterest,
	en.iab.preferenceCenter.vendorList.privacyPolicy,
	en.iab.preferenceCenter.vendorList.purposes,
	en.iab.preferenceCenter.vendorList.specialFeatures,
	en.iab.preferenceCenter.vendorList.specialPurposes,
	en.iab.preferenceCenter.vendorList.adTechProvidersHeading,
].filter((label) => !label.includes('{'));

const walk = function walk(directory: string): string[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return entry.name === 'generated' ? [] : walk(path);
		}
		return /\.(?:swift|kt|xml)$/u.test(entry.name) ? [path] : [];
	});
};

/** Placeholder-free runs of a template long enough to identify it. */
const fragmentsOf = (template: string): string[] =>
	template
		.split(/\{[^}]+\}/u)
		.map((fragment) => fragment.trim())
		.filter((fragment) => fragment.length >= MIN_FRAGMENT_LENGTH);

describe('native IAB copy', () => {
	it('has English app copy to guard', () => {
		expect(en.iab.app).toBeDefined();
		expect(POLICY_COPY.length).toBeGreaterThan(1);
	});

	it('keeps policy sentences out of native view sources', () => {
		const fragments = [
			...POLICY_COPY.flatMap(fragmentsOf),
			...RETIRED_LITERALS,
		];
		const files = UI_SOURCE_ROOTS.flatMap((root) =>
			walk(join(REPO_ROOT, root))
		);
		expect(files.length).toBeGreaterThan(0);

		const offenders = files.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			return fragments
				.filter((fragment) => source.includes(fragment))
				.map((fragment) => `${relative(REPO_ROOT, file)}: "${fragment}"`);
		});
		expect(
			offenders,
			'Use IABCopy / IabCopy from the generated tables instead of literals'
		).toEqual([]);
	});

	it('keeps IAB labels out of native view sources as string literals', () => {
		const files = UI_SOURCE_ROOTS.flatMap((root) =>
			walk(join(REPO_ROOT, root))
		);
		const offenders = files.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			return UI_LABELS.filter((label) =>
				source.includes(JSON.stringify(label))
			).map((label) => `${relative(REPO_ROOT, file)}: "${label}"`);
		});
		expect(
			offenders,
			'Use IABCopy / IabCopy from the generated tables instead of literals'
		).toEqual([]);
	});
});
