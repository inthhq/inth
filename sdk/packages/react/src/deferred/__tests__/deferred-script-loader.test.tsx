/**
 * `useScriptLoader` under a deferred root's stand-in kernel: a script that
 * may run with the server's state starts the engine at once, instead of
 * waiting for the page's priority images or a tap. A gated script the
 * visitor has not allowed does not.
 */
import type { ConsentSnapshot } from '@c15t/core';
import type { Script } from '@c15t/core/modules/script-loader';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { KernelContext } from '../../context';
import { useScriptLoader } from '../../module-hooks/script-loader';
import { createDeferredKernel } from '../deferred-kernel';
import { isRunnableNow, scriptsNeedEngine } from '../runnable';

const freshVisitor = {
	activeUI: 'banner',
	effectivePermissions: {
		marketing: false,
		measurement: false,
		necessary: true,
	},
} as unknown as ConsentSnapshot;

const gated: Script = {
	category: 'measurement',
	id: 'gated',
	src: '/gated.js',
};

const standIn = function standIn() {
	const requestEngine = vi.fn();
	const handle = createDeferredKernel({
		requestEngine,
		serverSnapshot: freshVisitor,
		snapshot: freshVisitor,
	});
	return { handle, requestEngine };
};

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	});

const Loader = ({ scripts }: { scripts: Script[] }) => {
	useScriptLoader(scripts);
	return null;
};

describe('isRunnableNow', () => {
	test.each([
		[{ alwaysLoad: true, category: 'marketing' }, true],
		[{ category: 'necessary' }, true],
		[{ category: 'measurement' }, false],
		[{ category: { or: ['necessary', 'measurement'] } }, true],
		[{ category: { and: ['necessary', 'measurement'] } }, false],
		[{ category: { not: 'marketing' } }, true],
		[{ category: 'unknown-category' }, false],
	] as [Pick<Script, 'alwaysLoad' | 'category'>, boolean][])(
		'%j → %s',
		(script, expected) => {
			expect(isRunnableNow(script, freshVisitor)).toBe(expected);
		}
	);
});

describe('scriptsNeedEngine', () => {
	const started = (): ReturnType<NonNullable<Script['serverStart']>> =>
		undefined as never;
	test('a runnable script the server did not start needs the engine', () => {
		expect(
			scriptsNeedEngine([{ ...gated, alwaysLoad: true }], freshVisitor, true)
		).toBe(true);
	});
	test('a runnable script the server started does not', () => {
		const script = { ...gated, alwaysLoad: true, serverStart: started };
		expect(scriptsNeedEngine([script], freshVisitor, true)).toBe(false);
		// Unless the root turned the server start off.
		expect(scriptsNeedEngine([script], freshVisitor, false)).toBe(true);
	});
	test('gated scripts the visitor has not allowed do not', () => {
		expect(scriptsNeedEngine([gated], freshVisitor, true)).toBe(false);
		expect(scriptsNeedEngine(undefined, freshVisitor, true)).toBe(false);
	});
});

describe('useScriptLoader under a stand-in kernel', () => {
	test('a gated script the visitor has not allowed leaves the engine waiting', async () => {
		const { handle, requestEngine } = standIn();
		await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[gated]} />
			</KernelContext.Provider>
		);
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
	});

	test.each([
		['an alwaysLoad', { ...gated, alwaysLoad: true, id: 'always' }],
		['a necessary', { ...gated, category: 'necessary', id: 'necessary' }],
	] as [string, Script][])(
		'%s script starts the engine on mount',
		async (_name, script) => {
			const { handle, requestEngine } = standIn();
			await render(
				<KernelContext.Provider value={handle.kernel}>
					<Loader scripts={[gated, script]} />
				</KernelContext.Provider>
			);
			await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
		}
	);

	test('a runnable script passed after mount starts the engine', async () => {
		const { handle, requestEngine } = standIn();
		const screen = await render(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[]} />
			</KernelContext.Provider>
		);
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
		await screen.rerender(
			<KernelContext.Provider value={handle.kernel}>
				<Loader scripts={[{ ...gated, alwaysLoad: true }]} />
			</KernelContext.Provider>
		);
		await vi.waitFor(() => expect(requestEngine).toHaveBeenCalled());
	});
});
