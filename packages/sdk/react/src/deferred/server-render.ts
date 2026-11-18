/**
 * What a framework root's engine side shares on the server: loading the
 * server start module, reading streamed state under React 18 and 19, and
 * one render id and start plan per render.
 *
 * @packageDocumentation
 * @internal
 */

import { newRenderId } from '@inth/sdk/runtime/page-globals';
import type * as ScriptServerStart from '@inth/sdk/runtime/script-server-start';
import * as React from 'react';

import type { ConsentProviderOptions } from '../provider';

/** @internal */
export type ScriptServerStartModule = typeof ScriptServerStart;

/** A promise that keeps its result where React 18 reads it on a retry. @internal */
export type Recorded<Value> = Promise<Value> & {
	status?: 'fulfilled';
	value?: Value;
};

/** `promise`, which must not reject, recording its result on itself. */
const record = function record<Value>(
	promise: Promise<Value>
): Recorded<Value> {
	const holder: { recorded?: Recorded<Value> } = {};
	const recorded: Recorded<Value> = (async () => {
		const value = await promise;
		// Set by now: the await above yields.
		if (holder.recorded) {
			holder.recorded.status = 'fulfilled';
			holder.recorded.value = value;
		}
		return value;
	})();
	holder.recorded = recorded;
	return recorded;
};

const loadScriptServerStart = function loadScriptServerStart(): Recorded<
	ScriptServerStartModule | undefined
> {
	return record(
		(async () => {
			try {
				return await import('@inth/sdk/runtime/script-server-start');
			} catch {
				return undefined;
			}
		})()
	);
};

let scriptServerStartModule:
	| Recorded<ScriptServerStartModule | undefined>
	| undefined;
let retriedScriptServerStart:
	| Recorded<ScriptServerStartModule | undefined>
	| undefined;

/**
 * The server start module. Loaded on the server only, so no browser chunk
 * requests it. A failed import skips the server start and retries on the
 * side for later renders.
 *
 * @returns The module, `undefined` once its import failed.
 * @internal
 */
export const importScriptServerStart =
	function importScriptServerStart(): Recorded<
		ScriptServerStartModule | undefined
	> {
		const loaded = scriptServerStartModule;
		if (loaded?.status === 'fulfilled' && !loaded.value) {
			// Every render gets the failed load until the retry settles. On
			// React 18 a render that waited for the load calls again, and a
			// pending import there would suspend it again.
			retriedScriptServerStart ??= loadScriptServerStart();
			if (retriedScriptServerStart.status !== 'fulfilled') {
				return loaded;
			}
			scriptServerStartModule = retriedScriptServerStart;
			retriedScriptServerStart = undefined;
		}
		scriptServerStartModule ??= loadScriptServerStart();
		return scriptServerStartModule;
	};

const settledStates = new WeakMap<Promise<unknown>, Recorded<unknown>>();

/**
 * `state` with a rejection as `undefined`: the provider falls back to its
 * transport then, and the server start has nothing to start. One promise
 * per input, so `use` sees the same value on a retry.
 *
 * @internal
 */
export const settledState = function settledState<State>(
	state: Promise<State>
): Recorded<State | undefined> {
	let settled = settledStates.get(state) as
		| Recorded<State | undefined>
		| undefined;
	if (!settled) {
		settled = record(
			(async () => {
				try {
					return await state;
				} catch {
					return undefined;
				}
			})()
		);
		settledStates.set(state, settled);
	}
	return settled;
};

/** React 19's `use`, absent from React 18. */
const { use } = React as {
	use?: <Value>(value: Promise<Value>) => Value;
};

/**
 * `use` where React has it. React 18 suspends on a thrown promise and
 * reads its recorded result on the retry.
 *
 * @internal
 */
export const read = function read<Value>(promise: Recorded<Value>): Value {
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `read` is `use` with a React 18 fallback, so it keeps `use`'s rules: render only, conditions allowed.
		return use(promise);
	}
	if (promise.status === 'fulfilled') {
		return promise.value as Value;
	}
	throw promise;
};

/**
 * One id and one `serverScriptStartPlan` per render, shared by the boot
 * data, the stored-choice check and the start script: each `serverStart`
 * runs once, the check and the start describe the same script, and the
 * page object their inline scripts write carries the id the boot data
 * names. Keyed by the provider options all three receive from the render.
 * The id needs no module: boot data that renders while the module loads
 * names the render its later start script writes, so a root that goes
 * before that script runs ends it (`endPageRender`).
 */
interface Render {
	id: string;
	plan?: ScriptServerStart.ServerScriptStartPlan;
	state: unknown;
}

const renders = new WeakMap<object, Render>();

/**
 * This render's id, for `options` and `state`.
 *
 * @param options - The provider options the render passes.
 * @param state - The consent state it renders with.
 * @internal
 */
export const renderFor = function renderFor(
	options: ConsentProviderOptions,
	state: unknown
): Readonly<Render> {
	let render = renders.get(options);
	if (!render || render.state !== state) {
		render = { id: newRenderId(), state };
		renders.set(options, render);
	}
	return render;
};

/**
 * This render's server start plan, made once.
 *
 * @param options - The provider options the render passes.
 * @param state - The consent state it renders with.
 * @internal
 */
export const renderPlan = function renderPlan(
	module: ScriptServerStartModule,
	options: ConsentProviderOptions,
	state: unknown
): ScriptServerStart.ServerScriptStartPlan {
	const render: Render = renderFor(options, state);
	render.plan ??= module.serverScriptStartPlan(
		{
			...(options as unknown as Parameters<
				ScriptServerStartModule['serverScriptStartPlan']
			>[0]),
			prefetch: state as Parameters<
				ScriptServerStartModule['serverScriptStartPlan']
			>[0]['prefetch'],
		},
		render.id
	);
	return render.plan;
};
