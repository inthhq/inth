/**
 * The branding tag appends `?ref=<hostname>` for attribution. Reading
 * `window.location` during render makes the server-rendered HTML and the first
 * client render disagree, which Vue reports as a hydration mismatch — so the
 * hostname has to land after mount.
 */
import type { InitOutput } from '@inth/sdk/schema/types';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { computed, createSSRApp, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';

import ConsentTag from '../runtime/components/tag.vue';
import { consentConfigKey } from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';
import { symbolInit } from '../runtime/utils/consent-symbols.model';

const provides = function provides(branding: InitOutput['branding']) {
	return {
		[consentConfigKey as symbol]: computed(() => ({}) as ConsentConfig),
		[symbolInit]: ref({ branding } as InitOutput),
	};
};

const mountTag = function mountTag(branding: InitOutput['branding'] = 'c15t') {
	return mount(ConsentTag, {
		global: { provide: provides(branding) },
		props: { surface: 'banner' as const },
	});
};

const renderTagOnServer = function renderTagOnServer(
	branding: InitOutput['branding'] = 'c15t'
) {
	const app = createSSRApp(ConsentTag, { surface: 'banner' });
	const injected = provides(branding);
	// `Object.entries` drops symbol keys, and every injection key here is one.
	for (const key of Reflect.ownKeys(injected)) {
		app.provide(key as symbol, injected[key as keyof typeof injected]);
	}
	return renderToString(app);
};

describe('consent tag branding link', () => {
	test('uses same-page navigation by default and preserves configured targets', () => {
		const stock = mountTag();
		expect(stock.get('a').attributes('target')).toBeUndefined();
		stock.unmount();
		const configured = mount(ConsentTag, {
			global: {
				provide: {
					...provides('inth'),
					[consentConfigKey as symbol]: {
						components: {
							tag: { banner: { rel: 'noopener', target: '_blank' } },
						},
					},
				},
			},
			props: { surface: 'banner' },
		});
		expect(configured.get('a').attributes('target')).toBe('_blank');
		expect(configured.get('a').attributes('rel')).toBe('noopener');
		configured.unmount();
	});

	test('server-rendered markup carries no ref param', async () => {
		// `onMounted` never runs on the server, so the href has to be the bare
		// host — anything else is the hydration mismatch this guards against.
		const html = await renderTagOnServer();

		expect(html).toContain('href="https://c15t.com"');
		expect(html).not.toContain('?ref=');
	});

	test('client markup matches the server markup before mount completes', async () => {
		const server = await renderTagOnServer();
		const wrapper = mountTag();

		// Pre-flush: the client's first paint must equal the server's HTML.
		expect(wrapper.get('a').attributes('href')).toBe('https://c15t.com');
		expect(server).toContain('href="https://c15t.com"');

		wrapper.unmount();
	});

	test('appends ?ref=<hostname> once mounted', async () => {
		const wrapper = mountTag();
		await flushPromises();

		expect(wrapper.get('a').attributes('href')).toBe(
			`https://c15t.com?ref=${window.location.hostname}`
		);

		wrapper.unmount();
	});

	test('keeps the ref param on the inth branding host', async () => {
		const wrapper = mountTag('inth');
		await flushPromises();

		expect(wrapper.get('a').attributes('href')).toBe(
			`https://inth.com?ref=${window.location.hostname}`
		);

		wrapper.unmount();
	});

	test('the widget tag takes the widget slot and test id', () => {
		const wrapper = mount(ConsentTag, {
			global: {
				provide: {
					...provides('inth'),
					[consentConfigKey as symbol]: computed(
						() =>
							({
								components: {
									tag: {
										dialog: { class: 'dialog-tag' },
										manager: { class: 'widget-tag' },
									},
								},
							}) as ConsentConfig
					),
				},
			},
			props: { surface: 'widget' },
		});
		const link = wrapper.get('a');
		expect(link.attributes('data-testid')).toBe('consent-widget-branding');
		expect(link.classes()).toContain('widget-tag');
		expect(link.classes()).not.toContain('dialog-tag');
		wrapper.unmount();
	});

	test('renders nothing when branding is disabled', () => {
		const wrapper = mountTag('none');

		expect(wrapper.find('a').exists()).toBe(false);

		wrapper.unmount();
	});
});
