/**
 * A page carries only the container it shows (§7): a Drawer site never
 * loads the Card or Banner component, and with it their stylesheet; the
 * in-place options wait for Customize; and a page that owes no choice
 * loads no container at all. Each container component imports only its
 * own stylesheet, so loading the component is loading the sheet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
	promptContainers,
	promptContainersKey,
} from '../runtime/components/prompt/containers';
import type { PromptContainers } from '../runtime/components/prompt/containers';
import {
	$,
	mountConsentUI,
	must,
	settle,
	unmountConsentUI,
	waitFor,
} from './consent-ui-fixture';

const PROMPT_DIR = join(__dirname, '../runtime/components/prompt');
const read = (file: string) => readFileSync(join(PROMPT_DIR, file), 'utf8');
const SHEET_IMPORT =
	/import '@inth\/sdk\/ui\/styles\/components\/(?<name>[a-z-]+)\.css';/gu;
const STATIC_VUE_IMPORT = /^import \w+ from '\.\/(?<file>[a-z-]+)\.vue';/gmu;
const sheetsOf = (file: string) =>
	[...read(file).matchAll(SHEET_IMPORT)].map((match) => match.groups?.name);
const staticComponentsOf = (file: string) =>
	[...read(file).matchAll(STATIC_VUE_IMPORT)].map(
		(match) => match.groups?.file
	);

/** The real containers, recording which ones the banner asks for. */
const recordingContainers = function recordingContainers(
	requested: Set<string>
): PromptContainers {
	const record = (name: keyof PromptContainers) => () => {
		requested.add(name);
		return promptContainers[name]();
	};
	return {
		banner: record('banner'),
		card: record('card'),
		drawer: record('drawer'),
	};
};

afterEach(async () => {
	await unmountConsentUI();
});

describe('consent banner stylesheets', () => {
	test('each container component imports its own sheet and no other', () => {
		expect(sheetsOf('card.vue')).toEqual(['consent-card']);
		expect(sheetsOf('banner.vue')).toEqual(['consent-banner']);
		expect(sheetsOf('drawer.vue')).toEqual(['consent-drawer']);
		// The shared shell brings no container's rules.
		for (const file of ['prompt.vue', 'surface.vue', 'panel.vue', 'tag.vue']) {
			for (const name of sheetsOf(file)) {
				expect([
					'consent-card',
					'consent-banner',
					'consent-drawer',
				]).not.toContain(name);
			}
		}
		// The in-place options and their rules load with the panel, never
		// with the prompt.
		expect(sheetsOf('surface.vue')).not.toContain('consent-expand');
		expect(staticComponentsOf('surface.vue')).not.toContain('panel');
		expect(sheetsOf('panel.vue')).toContain('consent-expand');
	});

	test('a page that owes no choice asks for no container', async () => {
		const requested = new Set<string>();
		await mountConsentUI({
			provide: {
				[promptContainersKey as symbol]: recordingContainers(requested),
			},
			region: 'us-opt-out',
		});
		await settle();
		expect($('consent-banner-root')).toBeNull();
		expect([...requested]).toEqual([]);
	});

	test('a Drawer never loads the Card or Banner sheet, and the options wait for Customize', async () => {
		const requested = new Set<string>();
		await mountConsentUI({
			container: { side: 'bottom', type: 'drawer' },
			provide: {
				[promptContainersKey as symbol]: recordingContainers(requested),
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
