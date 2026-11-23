import { createConsentRuntime } from '@inth/sdk/runtime';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import { mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import { inth } from '../index';
import { useScriptLoader } from '../runtime/composables';
import type { Script } from '../runtime/composables';
import type { VueConsentKernelContext } from '../runtime/kernel';
import {
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/consent-symbols.model';
import { testing } from '../testing';
import { createVueConsentKernelContext } from './test-kernel';

/** An opt-in policy for measurement and marketing, already resolved. */
const resolution = resolvePolicyRules({
	countryCode: null,
	regionCode: null,
	rules: [
		{
			categories: ['measurement', 'marketing'],
			id: 'scripts',
			match: { fallback: true },
			model: 'opt-in',
			prompt: 'choice',
		},
	],
});

const contexts: VueConsentKernelContext[] = [];

/**
 * A context the plugin owns, resolved without a request and started, as
 * the draft test builds one. Provided directly, so no mount starts it.
 */
const ownedContext = (scripts: Script[] = []) => {
	const context = createVueConsentKernelContext({
		config: {
			consentCategories: ['necessary', 'measurement', 'marketing'],
			scripts,
		},
		kernelConfig: { initialPolicyResolution: resolution },
	});
	context.start();
	contexts.push(context);
	return context;
};

const provide = (context: VueConsentKernelContext) => ({
	global: {
		provide: {
			[symbolKernelContext as symbol]: context,
			[symbolKernel as symbol]: context.kernel,
			[symbolSnapshot as symbol]: context.snapshot,
		},
	},
});

/** A runtime a host owns, resolved the same way. */
const borrowedRuntime = (options: { enabled?: boolean } = {}) =>
	createConsentRuntime({
		...options,
		mode: testing(),
		prefetch: { initialPolicyResolution: resolution },
	});

const inserted = (src: string) =>
	document.querySelectorAll(`script[src="${src}"]`).length;

const late: Script = { category: 'measurement', id: 'late', src: '/late.js' };
const later: Script = { category: 'marketing', id: 'later', src: '/later.js' };

afterEach(() => {
	for (const context of contexts.splice(0)) {
		context.dispose();
	}
	document.head.replaceChildren();
	document.body.replaceChildren();
});

test('joins the plugin runtime’s loader, follows consent and its ref, and leaves on unmount', async () => {
	const scripts = ref<Script[]>([late]);
	const context = ownedContext([
		{ category: 'measurement', id: 'configured', src: '/configured.js' },
	]);
	const { kernel } = context;
	const Probe = defineComponent({
		setup() {
			useScriptLoader(scripts);
			return () => h('div');
		},
	});
	const wrapper = mount(Probe, provide(context));
	expect(inserted('/late.js')).toBe(0);

	await kernel.commands.save({ measurement: true });
	// One loader owns both: the configured script and the registered one.
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(1));
	expect(inserted('/configured.js')).toBe(1);

	// A push into the ref is a change too.
	scripts.value.push(later);
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(1));
	await kernel.commands.save({ marketing: true, measurement: true });
	await vi.waitFor(() => expect(inserted('/later.js')).toBe(1));

	// A new value drops the first entry; the loader reconciles.
	scripts.value = [later];
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(0));
	expect(inserted('/later.js')).toBe(1);

	wrapper.unmount();
	await vi.waitFor(() => expect(inserted('/later.js')).toBe(0));
	expect(inserted('/configured.js')).toBe(1);
});

test('runs its own loader on a borrowed runtime, whose scripts are its host’s', async () => {
	const runtime = borrowedRuntime();
	const Probe = defineComponent({
		setup() {
			useScriptLoader([late]);
			return () => h('div');
		},
	});
	const wrapper = mount(Probe, {
		global: { plugins: [[inth, { runtime }]] },
	});
	runtime.start();
	expect(runtime.scripts).toEqual([]);

	await runtime.kernel.commands.save({ measurement: true });
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(1));
	// The host's own scripts are untouched.
	expect(runtime.scripts).toEqual([]);

	wrapper.unmount();
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(0));
	runtime.dispose();
});

test('two components sharing one array register twice and unregister one at a time', async () => {
	const shared: Script[] = [late];
	const context = ownedContext();
	const { kernel } = context;
	const Probe = defineComponent({
		setup() {
			useScriptLoader(shared);
			return () => h('div');
		},
	});
	const Pair = defineComponent({
		props: { second: { default: true, type: Boolean } },
		setup: (props) => () => [h(Probe), props.second ? h(Probe) : null],
	});
	const wrapper = mount(Pair, provide(context));
	await kernel.commands.save({ measurement: true });
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(1));

	// One component leaves: the other still wants the script.
	await wrapper.setProps({ second: false });
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(inserted('/late.js')).toBe(1);

	wrapper.unmount();
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(0));
});

test('a registered script with a configured script’s id replaces it, once', async () => {
	const context = ownedContext([
		{ category: 'measurement', id: 'tag', src: '/tag.js' },
	]);
	const { kernel } = context;
	const Probe = defineComponent({
		setup() {
			useScriptLoader([
				{ category: 'measurement', id: 'tag', src: '/tag-v2.js' },
			]);
			return () => h('div');
		},
	});
	const wrapper = mount(Probe, provide(context));
	await kernel.commands.save({ measurement: true });
	await vi.waitFor(() => expect(inserted('/tag-v2.js')).toBe(1));
	expect(inserted('/tag.js')).toBe(0);
	wrapper.unmount();
});

test('on a borrowed runtime the loader waits for the host to start it', async () => {
	const runtime = borrowedRuntime();
	const Probe = defineComponent({
		setup() {
			useScriptLoader([
				{ alwaysLoad: true, category: 'necessary', id: 'ops', src: '/ops.js' },
			]);
			return () => h('div');
		},
	});
	const wrapper = mount(Probe, {
		global: { plugins: [[inth, { runtime }]] },
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	// Not started: no loader runs, so even an always-on script waits for the
	// start that applies persistence and privacy signals.
	expect(inserted('/ops.js')).toBe(0);

	runtime.start();
	await vi.waitFor(() => expect(inserted('/ops.js')).toBe(1));
	wrapper.unmount();
	runtime.dispose();
});

test('on a borrowed runtime turned off, the loader still runs once the host starts it', async () => {
	// A runtime turned off grants every category and starts without
	// touching the kernel, so nothing but the start itself signals it.
	const runtime = borrowedRuntime({ enabled: false });
	const Probe = defineComponent({
		setup() {
			useScriptLoader([
				{ category: 'measurement', id: 'late', src: '/late.js' },
			]);
			return () => h('div');
		},
	});
	const wrapper = mount(Probe, {
		global: { plugins: [[inth, { runtime }]] },
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(inserted('/late.js')).toBe(0);

	runtime.start();
	await vi.waitFor(() => expect(inserted('/late.js')).toBe(1));
	wrapper.unmount();
	runtime.dispose();
});
