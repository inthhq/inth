/**
 * A Privacy Choices page carries only the presentation it shows (§7): a
 * Drawer site never loads the Card or Banner component, and with it their
 * stylesheet; the in-place options wait for Customize; and a classic site
 * loads no Privacy Choices component at all. Each presentation component
 * imports only its own stylesheet, so loading the component is loading
 * the sheet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';
import { defineAsyncComponent } from 'vue';

import {
	privacyChoicesPresentations,
	privacyChoicesPresentationsKey,
} from '../runtime/components/prompt/privacy-choices/presentations';
import type { PrivacyChoicesPresentations } from '../runtime/components/prompt/privacy-choices/presentations';
import {
	$,
	mountPrivacyChoices,
	must,
	unmountPrivacyChoices,
	waitFor,
} from './privacy-choices-fixture';

const PRESENTATIONS_DIR = join(
	__dirname,
	'../runtime/components/prompt/privacy-choices'
);
const read = (file: string) =>
	readFileSync(join(PRESENTATIONS_DIR, file), 'utf8');
const SHEET_IMPORT =
	/import '@inth\/sdk\/ui\/styles\/components\/(?<name>[a-z-]+)\.css';/gu;
const STATIC_VUE_IMPORT = /^import \w+ from '\.\/(?<file>[a-z-]+)\.vue';/gmu;
const sheetsOf = (file: string) =>
	[...read(file).matchAll(SHEET_IMPORT)].map((match) => match.groups?.name);
const staticComponentsOf = (file: string) =>
	[...read(file).matchAll(STATIC_VUE_IMPORT)].map(
		(match) => match.groups?.file
	);

/** The real presentations, recording which ones the banner asks for. */
const recordingPresentations = function recordingPresentations(
	requested: Set<string>
): PrivacyChoicesPresentations {
	const record = (name: keyof PrivacyChoicesPresentations) =>
		defineAsyncComponent({
			loader: () => {
				requested.add(name);
				return Promise.resolve(privacyChoicesPresentations[name]);
			},
			suspensible: false,
		});
	return {
		bar: record('bar'),
		card: record('card'),
		drawer: record('drawer'),
	};
};

afterEach(async () => {
	await unmountPrivacyChoices();
});

describe('Privacy Choices stylesheets', () => {
	test('each presentation component imports its own sheet and no other', () => {
		expect(sheetsOf('card.vue')).toEqual(['consent-card']);
		expect(sheetsOf('bar.vue')).toEqual(['consent-bar']);
		expect(sheetsOf('drawer.vue')).toEqual(['consent-drawer']);
		// The shared shell brings no presentation's rules.
		for (const file of ['surface.vue', 'panel.vue', 'tag.vue']) {
			for (const name of sheetsOf(file)) {
				expect(['consent-card', 'consent-bar', 'consent-drawer']).not.toContain(
					name
				);
			}
		}
		// The in-place options and their rules load with the panel, never
		// with the prompt.
		expect(sheetsOf('surface.vue')).not.toContain('consent-expand');
		expect(staticComponentsOf('surface.vue')).not.toContain('panel');
		expect(sheetsOf('panel.vue')).toContain('consent-expand');
	});

	test('a classic banner asks for no Privacy Choices presentation', async () => {
		const requested = new Set<string>();
		await mountPrivacyChoices({
			container: null,
			design: null,
			provide: {
				[privacyChoicesPresentationsKey as symbol]:
					recordingPresentations(requested),
			},
		});
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect([...requested]).toEqual([]);
	});

	test('a Drawer never loads the Card or Bar sheet, and the options wait for Customize', async () => {
		const requested = new Set<string>();
		await mountPrivacyChoices({
			container: { side: 'bottom', type: 'drawer' },
			provide: {
				[privacyChoicesPresentationsKey as symbol]:
					recordingPresentations(requested),
			},
		});
		await waitFor(() =>
			expect(must('consent-banner-root').getAttribute('data-placement')).toBe(
				'drawer-bottom'
			)
		);
		expect([...requested]).toEqual(['drawer']);
		// The options have not rendered, so their chunk has not loaded.
		expect(must('consent-banner-body').children).toHaveLength(0);
	});
});
