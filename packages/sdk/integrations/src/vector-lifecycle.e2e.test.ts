/** @vitest-environment jsdom */
import { createConsentKernel } from '@inth/sdk/engine';
import type { ConsentState, Script } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
	npmAndRemote,
	onRemoteDebug,
	remoteLoaderOption,
	resetRemote,
	settleRemote,
	splitRemote,
} from './__tests__/remote-path';
import { vector } from './vendors/ads-and-pixels/vector';

const denied: ConsentState = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};
const granted = { ...denied, marketing: true };
const pixelId = 'inth-test-pixel';
const disposers: (() => void)[] = [];

interface VectorClient {
	q?: [string, unknown[]][];
	loaded?: boolean;
	load: (...args: unknown[]) => unknown;
	identify: (...args: unknown[]) => unknown;
	on: (...args: unknown[]) => unknown;
}

declare global {
	interface Window {
		vector?: VectorClient;
	}
}

const client = () => window.vector;

/** Starts the production kernel and loader, with remote scripts on. */
const mount = async (
	script: Script = vector({ pixelId }),
	initial = denied
) => {
	const { code, load } = splitRemote([script]);
	const kernel = createConsentKernel(
		load.length > 0 ? { initialScriptRegistry: { load } } : undefined
	);
	void kernel.commands.save(initial);
	const loader = createScriptLoader({
		kernel,
		onDebug: onRemoteDebug,
		remote: remoteLoaderOption,
		scripts: code,
	});
	disposers.push(kernel.dispose, loader.dispose);
	await settleRemote();
	return { kernel, loader };
};

const pixelElement = () => document.head.querySelector('script');

afterEach(() => {
	for (const dispose of disposers.splice(0).reverse()) {
		dispose();
	}
	resetRemote();
	document.head.replaceChildren();
	document.body.replaceChildren();
	for (const name of [
		'vector',
		'Vector',
		'__vector_manager',
		'__inthRunSteps',
	]) {
		Reflect.deleteProperty(window, name);
	}
	vi.restoreAllMocks();
});

describe.each(npmAndRemote('vector', vector))(
	'Vector through the production kernel and script loader through the %s',
	(_label, build) => {
		it('keeps startup behind marketing consent and queues load before insertion', async () => {
			const storageWrites = vi.spyOn(Storage.prototype, 'setItem');
			const storageReads = vi.spyOn(Storage.prototype, 'getItem');
			const cookieBefore = document.cookie;
			const original = document.head.appendChild.bind(document.head);
			const appended = vi.spyOn(document.head, 'appendChild');
			const { kernel } = await mount(build({ pixelId }));
			void kernel.commands.save({ ...denied, measurement: true });
			expect(appended).not.toHaveBeenCalled();
			expect(client()).toBeUndefined();
			expect(storageWrites).not.toHaveBeenCalled();
			expect(storageReads).not.toHaveBeenCalled();
			expect(document.cookie).toBe(cookieBefore);

			appended.mockImplementation((node) => {
				expect(client()?.q).toEqual([['load', [pixelId]]]);
				return original(node);
			});
			void kernel.commands.save(granted);
			expect(appended).toHaveBeenCalledOnce();
			expect(pixelElement()?.src).toBe('https://cdn.vector.co/pixel.js');
			expect(pixelElement()?.async).toBe(true);
			expect(client()?.loaded).toBe(true);
		});

		it('replays nested arguments with original objects and callback references', async () => {
			await mount(build({ pixelId }), granted);
			const queue = client()?.q;
			const data = { source: 'application' };
			const callback = vi.fn();
			client()?.identify('known-id', data);
			client()?.on('pixel.loaded', callback);
			expect(queue).toEqual([
				['load', [pixelId]],
				['identify', ['known-id', data]],
				['on', ['pixel.loaded', callback]],
			]);
			expect(queue?.[1]?.[1][1]).toBe(data);
			expect(queue?.[2]?.[1][1]).toBe(callback);
			const live = { identify: vi.fn(), load: vi.fn(), on: vi.fn() };
			Reflect.set(window, 'vector', live);
			// Vector replays each entry as manager[name](...args).
			for (const [name, args] of queue ?? []) {
				if (name !== 'load' && name !== 'identify' && name !== 'on') {
					throw new Error(`Unexpected Vector method: ${name}`);
				}
				live[name](...args);
			}
			expect(live.load).toHaveBeenCalledExactlyOnceWith(pixelId);
			expect(live.identify).toHaveBeenCalledExactlyOnceWith('known-id', data);
			expect(live.on).toHaveBeenCalledExactlyOnceWith('pixel.loaded', callback);
		});

		it.each([false, true])(
			'keeps one SDK across withdrawal and regrant, already loaded=%s',
			async (loaded) => {
				const { kernel, loader } = await mount(build({ pixelId }), granted);
				const element = pixelElement();
				const stub = client();
				if (loaded) {
					element?.dispatchEvent(new Event('load'));
				}
				void kernel.commands.save(denied);
				expect(element?.isConnected).toBe(true);
				if (!loaded) {
					element?.dispatchEvent(new Event('load'));
				}
				void kernel.commands.save(granted);
				// A rerender passes the code scripts again; the server's list stays.
				loader.updateScripts(splitRemote([build({ pixelId })]).code);
				expect(pixelElement()).toBe(element);
				expect(document.head.querySelectorAll('script')).toHaveLength(1);
				expect(client()).toBe(stub);
				expect(client()?.q).toEqual([['load', [pixelId]]]);
			}
		);

		it('preserves a previously loaded SDK and never invokes undocumented teardown', async () => {
			const live = {
				block: vi.fn(),
				identify: vi.fn(),
				load: vi.fn(),
				on: vi.fn(),
				removeVisitor: vi.fn(),
			};
			Reflect.set(window, 'vector', live);
			const { kernel } = await mount(build({ pixelId }), granted);
			pixelElement()?.dispatchEvent(new Event('load'));
			void kernel.commands.save(denied);
			void kernel.commands.save(granted);
			expect(client()).toBe(live);
			expect(client()?.load).toBe(live.load);
			expect(client()?.identify).toBe(live.identify);
			expect(client()?.on).toBe(live.on);
			expect(live.load).toHaveBeenCalledExactlyOnceWith(pixelId);
			expect(live.block).not.toHaveBeenCalled();
			expect(live.removeVisitor).not.toHaveBeenCalled();
		});
	}
);

describe('Vector npm helper options', () => {
	// A server render starts an npm script inline; the remote loader builds
	// its scripts in the browser and gives them no serverStart.
	it('starts Vector inline with nested calls and callback references', () => {
		const script = vector({ pixelId });
		const inline = script.serverStart?.(
			{ consents: granted, hasConsent: true, id: script.id },
			script
		);
		expect(inline).toBeDefined();
		// oxlint-disable-next-line no-new-func -- Runs the generated server startup.
		new Function(`${inline?.prelude ?? ''};${inline?.code ?? ''}`)();
		const callback = vi.fn();
		client()?.on('pixel.loaded', callback);
		expect(client()?.q).toEqual([
			['load', [pixelId]],
			['on', ['pixel.loaded', callback]],
		]);
		expect(client()?.q?.[1]?.[1][1]).toBe(callback);
	});

	it.each([
		['   ', 'https://cdn.vector.co/pixel.js'],
		[
			' https://cdn.example.com/vector.js ',
			'https://cdn.example.com/vector.js',
		],
	])(
		'resolves scriptUrl %j and trims the pixel ID',
		async (scriptUrl, expected) => {
			await mount(vector({ pixelId: ` ${pixelId} `, scriptUrl }), granted);
			expect(pixelElement()?.src).toBe(expected);
			expect(client()?.q).toEqual([['load', [pixelId]]]);
		}
	);

	it.each(['', '   ', undefined])(
		'skips an absent or blank pixel ID %j',
		async (id) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			// Exercise a missing environment value from a JavaScript caller.
			await mount(vector({ pixelId: id as string }), granted);
			expect(error).toHaveBeenCalledWith(
				'vector: missing or invalid pixelId. The script will not load.'
			);
			expect(pixelElement()).toBeNull();
			expect(client()).toBeUndefined();
		}
	);
});
