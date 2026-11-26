/**
 * Runs one helper through the production script loader and records what it
 * does to the page, so a helper rebuilt another way (from a manifest or an
 * adapter) can be checked against the same trace.
 *
 * A trace is an ordered list of events:
 * - `step`: the scenario step that follows;
 * - `call`: a call on a vendor global the spec stubbed;
 * - `insert` / `remove` / `attr` / `text`: DOM changes, any parent;
 * - `cookie`: a `document.cookie` write;
 * - `storage`: a `setItem`, `removeItem` or `clear` on local or session storage;
 * - `load` / `error`: the harness completing a vendor file;
 * - `global` / `deleted`: `window` properties that changed during a step;
 * - `warn` / `consoleError` / `callbackError`: diagnostics.
 *
 * Loader element IDs are random, so they read `inth-#1`, `inth-#2` in order
 * of first appearance. Timers, idle callbacks, `Date`, `Math.random` and
 * `crypto.randomUUID` are fixed for each run.
 */
import { createConsentKernel } from '@inth/sdk/engine';
import type { ConsentKernel, ConsentState, Script } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import type {
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
} from '@inth/sdk/modules/script-loader';
import { vi } from 'vite-plus/test';

import { ALL_DENIED } from '../../engine/vendor-consent';
import {
	createRecorder,
	createStubs,
	installPageFakes,
	watchGlobals,
} from './page';
import type { TraceRecorder } from './page';
import type { JsonValue } from './serialize';

export interface TraceEvent {
	[key: string]: JsonValue;
}

export type TraceWindow = Window & typeof globalThis & Record<string, unknown>;

/** Tools a spec uses to stand in for a vendor's own code. */
export interface TraceStubs {
	readonly win: TraceWindow;
	/**
	 * A function that records each call as `path` with its arguments, then
	 * returns what `impl` returns.
	 */
	fn: (
		path: string,
		impl?: (this: unknown, ...args: unknown[]) => unknown
	) => (...args: unknown[]) => unknown;
	/**
	 * An object built from `members`: functions become recording functions
	 * named `path.key`, plain objects nest, other values are kept.
	 */
	api: <ApiType = Record<string, unknown>>(
		path: string,
		members: Record<string, unknown>
	) => ApiType;
	/** Sets `window[name]`. */
	install: (name: string, value: unknown) => void;
	/** Adds a free-form event, for a stub that is not a function call. */
	note: (event: TraceEvent) => void;
	/**
	 * The JSON-safe form a trace uses. Specs call this rather than importing
	 * the serializer, so stub labels stay readable across module resets.
	 */
	json: (value: unknown) => JsonValue;
}

/** What a scenario's custom step can drive. */
export interface TracePage {
	readonly kernel: ConsentKernel;
	readonly loader: ScriptLoaderHandle;
	readonly stubs: TraceStubs;
	/** Saves consent without waiting; the step settles afterwards. */
	save: (consents: Partial<ConsentState>) => void;
	/** Replaces the registration with a fresh script from the factory. */
	replace: () => void;
	/** Script elements the page inserted that have not loaded or failed. */
	pendingScripts: () => HTMLScriptElement[];
	/** Completes one script element as the harness's `load` step does. */
	completeLoad: (element: HTMLScriptElement) => Promise<void>;
	/** Lets timers and promises run, like the end of every step. */
	settle: (ms?: number) => Promise<void>;
}

export type TraceStep =
	| 'grant'
	| 'deny'
	/** Grant and then deny in the same task, with no await between. */
	| 'grant-then-deny'
	/** Completes every connected pending script, then any they insert. */
	| 'load'
	/** Like `load`, and also completes removed elements still downloading. */
	| 'load-detached'
	/** Fails the first connected pending script. */
	| 'error'
	/** Replaces the registration with an identical fresh script. */
	| 'replace'
	/**
	 * While a consent change is being delivered, saves a withdrawal and
	 * replaces the registration, so the loader queues both.
	 */
	| 'replace-while-revoke-pending'
	/** Page code removes the first connected pending script element. */
	| 'remove-element'
	| 'dispose'
	/**
	 * Disposes the loader and registers a fresh script with a new loader on
	 * the same consent, as a page that remounts its consent provider does.
	 */
	| 'remount'
	| { load: string }
	| { error: string }
	| { consent: Partial<ConsentState>; label: string }
	| { wait: number }
	| {
			label: string;
			run: (page: TracePage) => void | Promise<void>;
	  };

export interface TraceScenario {
	name: string;
	start: 'denied' | 'granted';
	steps: TraceStep[];
}

export interface TraceSpec {
	/** Fixture name: the vendor, plus the mode when it has several. */
	name: string;
	/** Builds the helper's script; called for the first registration and each replacement. */
	script: (stubs: TraceStubs) => Script;
	/** Categories that let the vendor run. The rest stay denied. */
	granted: Partial<ConsentState>;
	/**
	 * Runs before each scenario, before the page is recorded, for work such
	 * as registering a mock (`vi.doMock`) for a module the helper imports.
	 */
	prepare?: () => void | Promise<void>;
	/** Page state before the helper runs, such as a vendor SDK already present. */
	setup?: (stubs: TraceStubs) => void;
	/**
	 * Stands in for a vendor file running, before its load event: install
	 * what the file defines. `src` is the element's URL.
	 */
	onFileLoad?: (src: string, stubs: TraceStubs) => void;
	/** Vendor scenarios beyond the standard set. */
	scenarios?: TraceScenario[];
	/**
	 * Whether the standard scenarios run too. A spec that only changes how
	 * the vendor answers, for its own races, turns them off. @default true
	 */
	standardScenarios?: boolean;
	/**
	 * Waits for work fake timers do not drive, at the end of every step.
	 * @default `vi.dynamicImportSettled()`, for helpers that import a module
	 */
	waitForImports?: () => Promise<void>;
	/** Milliseconds of fake time each step lets pass. @default 1000 */
	stepMs?: number;
}

const NONCE = 'trace-nonce';
const LOAD_PASSES = 5;
const CATEGORIES = [
	'experience',
	'functionality',
	'measurement',
	'marketing',
] as const;

const deny = (): ConsentState => ({ ...ALL_DENIED });

const grantOf = (spec: TraceSpec): ConsentState => ({
	...ALL_DENIED,
	...spec.granted,
});

/** A category the vendor does not use, for a consent change that keeps it granted. */
const unrelatedCategory = (spec: TraceSpec) =>
	CATEGORIES.find((category) => spec.granted[category] !== true) ?? 'necessary';

const ELEMENT_ID = /\binth-[0-9a-f]{8}\b/gu;

/** Rewrites random loader IDs as `inth-#n` in order of first appearance. */
const normalizeIds = (events: TraceEvent[]): TraceEvent[] => {
	const names = new Map<string, string>();
	const rewrite = (value: JsonValue): JsonValue => {
		if (typeof value === 'string') {
			return value.replace(ELEMENT_ID, (match) => {
				let name = names.get(match);
				if (name === undefined) {
					name = `inth-#${names.size + 1}`;
					names.set(match, name);
				}
				return name;
			});
		}
		if (Array.isArray(value)) {
			return value.map(rewrite);
		}
		if (value !== null && typeof value === 'object') {
			return Object.fromEntries(
				Object.entries(value).map(([key, item]) => [key, rewrite(item)])
			);
		}
		return value;
	};
	return events.map((event) => rewrite(event) as TraceEvent);
};

const stepLabel = (step: TraceStep): string => {
	if (typeof step === 'string') {
		return step;
	}
	if ('label' in step) {
		return step.label;
	}
	if ('wait' in step) {
		return `wait ${step.wait}ms`;
	}
	if ('load' in step) {
		return `load ${step.load}`;
	}
	return `error ${step.error}`;
};

const srcOf = (element: HTMLScriptElement) => element.getAttribute('src') ?? '';

/** One scenario's page, kernel and loader. */
interface TraceRun extends TracePage {
	readonly spec: TraceSpec;
	readonly recorder: TraceRecorder;
	/** Every script the loader holds, in order. */
	scripts: Script[];
	mount: () => void;
	fail: (match?: string) => void;
	loadAll: (detached: boolean) => Promise<void>;
}

type NamedStep = Extract<TraceStep, string>;

const namedSteps: Record<NamedStep, (run: TraceRun) => void | Promise<void>> = {
	deny: (run) => {
		run.save(deny());
	},
	dispose: (run) => {
		run.loader.dispose();
	},
	error: (run) => {
		run.fail();
	},
	grant: (run) => {
		run.save(grantOf(run.spec));
	},
	'grant-then-deny': (run) => {
		run.save(grantOf(run.spec));
		run.save(deny());
	},
	load: (run) => run.loadAll(false),
	'load-detached': (run) => run.loadAll(true),
	remount: (run) => {
		run.loader.dispose();
		run.mount();
	},
	'remove-element': (run) => {
		run
			.pendingScripts()
			.find((element) => element.isConnected)
			?.remove();
	},
	replace: (run) => {
		run.replace();
	},
	'replace-while-revoke-pending': (run) => {
		// A script after the vendor's that, during the next consent change,
		// saves a withdrawal and replaces the list, so the loader queues both.
		let armed = true;
		const trigger: Script = {
			callbackOnly: true,
			category: 'necessary',
			id: 'trace-replacement-trigger',
			onConsentChange() {
				if (armed) {
					armed = false;
					run.save(deny());
					run.replace();
				}
			},
		};
		run.loader.updateScripts([...run.scripts, trigger]);
		run.save({ ...grantOf(run.spec), [unrelatedCategory(run.spec)]: true });
	},
};

const runStep = async (run: TraceRun, step: TraceStep): Promise<void> => {
	if (typeof step === 'string') {
		await namedSteps[step](run);
	} else if ('consent' in step) {
		run.save(step.consent);
	} else if ('run' in step) {
		await step.run(run);
	} else if ('load' in step) {
		const matching = run
			.pendingScripts()
			.filter((element) => srcOf(element).includes(step.load));
		for (const element of matching) {
			// oxlint-disable-next-line no-await-in-loop -- Files run one at a time, as a browser runs them.
			await run.completeLoad(element);
		}
	} else if ('error' in step) {
		run.fail(step.error);
	}
};

const startRun = (
	spec: TraceSpec,
	factory: (stubs: TraceStubs) => Script,
	recorder: TraceRecorder,
	stubs: TraceStubs
): TraceRun => {
	const kernel = createConsentKernel();
	const { push } = recorder;
	const onDebug = (event: ScriptLoaderDebugEvent) => {
		if (event.action === 'callback_error') {
			const data = event.data as { error?: unknown } | undefined;
			push({
				callbackError: `${String(event.callback)}: ${String(data?.error ?? event.message)}`,
			});
		} else if (event.action === 'error') {
			push({ loaderError: event.message });
		}
	};
	const waitForImports =
		spec.waitForImports ?? (() => vi.dynamicImportSettled());
	let loader: ScriptLoaderHandle | undefined;
	const run: TraceRun = {
		async completeLoad(element) {
			recorder.settled(element);
			push({ load: srcOf(element) });
			spec.onFileLoad?.(srcOf(element), stubs);
			element.dispatchEvent(new Event('load'));
			await run.settle(0);
		},
		fail(match) {
			const element = recorder
				.pending()
				.find((item) =>
					match === undefined ? item.isConnected : srcOf(item).includes(match)
				);
			if (!element) {
				push({ error: '[no pending script]' });
				return;
			}
			recorder.settled(element);
			push({ error: srcOf(element) });
			element.dispatchEvent(new Event('error'));
		},
		kernel,
		async loadAll(detached) {
			const batchOf = (withDetached: boolean) =>
				recorder
					.pending()
					.filter((element) => withDetached || element.isConnected);
			for (let pass = 0; pass < LOAD_PASSES; pass += 1) {
				// Files a completed file inserted complete only while connected.
				const batch = batchOf(detached && pass === 0);
				if (batch.length === 0) {
					return;
				}
				for (const element of batch) {
					// oxlint-disable-next-line no-await-in-loop -- Files run one at a time, as a browser runs them.
					await run.completeLoad(element);
				}
			}
		},
		get loader() {
			if (!loader) {
				throw new Error('The trace loader is not mounted.');
			}
			return loader;
		},
		mount() {
			run.scripts = [factory(stubs)];
			loader = createScriptLoader({
				emitToV2DebugListeners: false,
				kernel,
				nonce: NONCE,
				onDebug,
				scripts: run.scripts,
			});
		},
		pendingScripts: recorder.pending,
		recorder,
		replace() {
			run.scripts = [factory(stubs)];
			run.loader.updateScripts(run.scripts);
		},
		save(consents) {
			void kernel.commands.save({ ...deny(), ...consents });
		},
		scripts: [],
		async settle(ms = spec.stepMs ?? 1000) {
			await vi.advanceTimersByTimeAsync(0);
			await waitForImports();
			await vi.advanceTimersByTimeAsync(ms);
		},
		spec,
		stubs,
	};
	return run;
};

/**
 * Runs `scenario` against `factory` (the spec's own helper by default) on a
 * clean page and returns its trace. Leaves the page clean afterwards.
 */
export const runTraceScenario = async function runTraceScenario(
	spec: TraceSpec,
	scenario: TraceScenario,
	factory: (stubs: TraceStubs) => Script = spec.script
): Promise<TraceEvent[]> {
	await spec.prepare?.();
	const win = window as TraceWindow;
	const recorder = createRecorder();
	const restorePage = installPageFakes(recorder.push);
	const globals = watchGlobals(win, recorder.push);
	const stubs = createStubs(win, recorder.push);
	const run = startRun(spec, factory, recorder, stubs);
	try {
		spec.setup?.(stubs);
		recorder.push({ step: `start ${scenario.start}` });
		run.save(scenario.start === 'granted' ? grantOf(spec) : deny());
		run.mount();
		await run.settle();
		globals.diff();
		for (const step of scenario.steps) {
			recorder.push({ step: stepLabel(step) });
			// oxlint-disable-next-line no-await-in-loop -- Steps are a sequence; each sees the page the last one left.
			await runStep(run, step);
			// oxlint-disable-next-line no-await-in-loop -- See above.
			await run.settle(
				typeof step === 'object' && 'wait' in step ? step.wait : undefined
			);
			globals.diff();
		}
		recorder.flush();
		return normalizeIds(recorder.events);
	} finally {
		recorder.stop();
		try {
			run.loader.dispose();
		} catch {
			// The run failed before the loader was mounted.
		}
		run.kernel.dispose();
		// Before the fakes come off, so a restored value is never a fake.
		globals.restore();
		restorePage();
	}
};
