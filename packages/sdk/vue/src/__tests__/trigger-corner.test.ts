import type { KernelTranslations } from '@inth/sdk/engine';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import triggerStyles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import type { ComponentPublicInstance } from 'vue';

import ConsentDialogTrigger from '../runtime/components/panel-trigger.vue';
import { consentConfigKey } from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';
import type { VueConsentKernelContext } from './test-kernel';

const STORAGE_KEY = 'inth-trigger-position';

const choiceRule: PolicyRule = {
	id: 'vue_trigger_corner',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

let mounted: {
	context: VueConsentKernelContext;
	wrapper: VueWrapper<ComponentPublicInstance>;
} | null = null;

const trigger = () =>
	document.querySelector<HTMLButtonElement>(
		'[data-testid="consent-dialog-trigger"]'
	);

const renderTrigger = async function renderTrigger(
	extra: Partial<ConsentConfig> = {},
	initialTranslations?: KernelTranslations
) {
	const config = {
		consentCategories: ['necessary', 'measurement'],
		disableAnimation: true,
		triggerShowWhen: 'always',
		...extra,
	} as ConsentConfig;
	const context = createVueConsentKernelContext({
		config,
		kernelConfig: {
			initialLocation: initialTranslations
				? { countryCode: 'DE', regionCode: null }
				: undefined,
			initialPolicyResolution: resolvePolicyRules({
				countryCode: 'DE',
				regionCode: null,
				rules: [choiceRule],
			}),
			initialTranslations,
			transport: {
				init: () => Promise.resolve({}),
				save: () => Promise.resolve({ ok: true, subjectId: 'vue-corner' }),
			},
		},
	});
	const wrapper = mount(ConsentDialogTrigger, {
		attachTo: document.body,
		global: {
			provide: {
				[consentConfigKey as symbol]: config,
				[symbolKernelContext as symbol]: context,
				[symbolKernel as symbol]: context.kernel,
				[symbolSnapshot as symbol]: context.snapshot,
				[symbolInit as symbol]: context.init,
				[symbolActiveUI as symbol]: context.activeUI,
				[symbolConsent as symbol]: context.storedConsent,
			},
		},
	});
	await flushPromises();
	mounted = { context, wrapper };
	return context;
};

/** jsdom has no PointerEvent; MouseEvent carries every field read. */
const pointer = function pointer(
	type: string,
	clientX: number,
	clientY: number
): Event {
	return new MouseEvent(type, {
		bubbles: true,
		button: 0,
		cancelable: true,
		clientX,
		clientY,
	});
};

const drag = async function drag(
	element: HTMLElement,
	from: [number, number],
	to: [number, number]
) {
	element.dispatchEvent(pointer('pointerdown', ...from));
	element.dispatchEvent(pointer('pointermove', ...to));
	element.dispatchEvent(pointer('pointerup', ...to));
	await flushPromises();
};

afterEach(() => {
	if (mounted) {
		mounted.wrapper.unmount();
		mounted.context.dispose();
		mounted = null;
	}
	window.localStorage.clear();
	document.body.innerHTML = '';
});

describe('ConsentDialogTrigger corner', () => {
	test('starts in the configured corner', async () => {
		await renderTrigger({ triggerDefaultPosition: 'top-left' });
		expect(trigger()?.classList.contains(triggerStyles.topLeft)).toBe(true);
		expect(trigger()?.style.left).toBe('');
	});

	test('reads the corner the other adapters persist', async () => {
		window.localStorage.setItem(STORAGE_KEY, 'top-right');
		await renderTrigger();
		expect(trigger()?.classList.contains(triggerStyles.topRight)).toBe(true);
	});

	test('a drag snaps to the next corner, persists it and does not open the dialog', async () => {
		const context = await renderTrigger();
		const button = trigger() as HTMLButtonElement;
		await drag(button, [500, 500], [100, 500]);

		expect(button.classList.contains(triggerStyles.bottomLeft)).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe('bottom-left');
		expect(window.localStorage.getItem('inth:dialog-trigger-position')).toBe(
			null
		);

		button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await flushPromises();
		expect(context.activeUI.value).not.toBe('manager');

		// A keyboard click after the drag still opens it.
		button.click();
		await flushPromises();
		expect(context.activeUI.value).toBe('manager');
	});

	test('keeps the corner to itself without triggerPersistPosition', async () => {
		await renderTrigger({ triggerPersistPosition: false });
		const button = trigger() as HTMLButtonElement;
		await drag(button, [500, 500], [500, 100]);

		expect(button.classList.contains(triggerStyles.topRight)).toBe(true);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});

describe('ConsentDialogTrigger label', () => {
	test('reads the trigger label from the translations', async () => {
		await renderTrigger({}, {
			language: 'de',
			translations: { trigger: { label: 'Datenschutz öffnen' } },
		} as unknown as KernelTranslations);
		expect(trigger()?.getAttribute('aria-label')).toBe('Datenschutz öffnen');
	});

	test('labels the trigger in English without translations', async () => {
		await renderTrigger();
		expect(trigger()?.getAttribute('aria-label')).toBe('Open privacy settings');
	});

	test('triggerAriaLabel wins over the translations', async () => {
		await renderTrigger({ triggerAriaLabel: 'Privacy' });
		expect(trigger()?.getAttribute('aria-label')).toBe('Privacy');
	});
});
