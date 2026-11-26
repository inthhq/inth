/**
 * Where the level 3 part of the manifest runtime plugs in. The part runs
 * `if`, `setFlag`, `listen`, `defer` and `callGlobal.then`, and checks them for the
 * parser. It is a file of its own (`level-three.ts`), so a page whose
 * manifests need level 2 at most never downloads it; whoever loads the
 * runtime loads the part first when a manifest `requires` level 3.
 *
 * The part reaches the rest of the runtime only through what these calls
 * pass it. `inth.manifests.js` builds with `part-none.ts` in place of this
 * file, so none of the code that hands steps to the part is in it.
 */
import type {
	Script,
	ScriptCallbackInfo,
	ScriptLifecycleCallback,
} from '../libs/script-loader/types';
import type { ManifestStep, ResolvedManifest } from './types';

/** What one manifest script keeps between its callbacks. */
export interface ScriptState {
	/** Tags its `loadScriptStep` steps inserted, by id. */
	tags: Map<string, HTMLScriptElement>;
	/** Its script element, from the last callback that had one. */
	element?: HTMLScriptElement;
	/** The last callback info it got before disposal. */
	latest?: ScriptCallbackInfo;
	disposed: boolean;
	/**
	 * The `consentGate` value: one function per registration. Once the
	 * registration is disposed it returns `null` for ever.
	 */
	gate: (value: unknown) => unknown;
}

/** What runtime values and owned tags read while steps run. */
export interface StepValues {
	/** The callback info the steps run for. */
	info?: ScriptCallbackInfo;
	state?: ScriptState;
	/** The manifest's `globals`: the only roots a step may use. */
	globals?: readonly string[];
	/**
	 * For steps run after their callback returned: whether their load is
	 * still current. A step can dispose the script, and the steps after it
	 * then run nothing.
	 */
	live?: () => boolean;
}

/** A run of steps, as `executePhaseSteps` reports it in debug events. */
export interface PhaseContext {
	scriptId: string;
	elementId: string;
	hasConsent: boolean;
	callback: ScriptLifecycleCallback;
	phase: string;
	values?: StepValues;
}

/** The parts of the runtime the level 3 part calls. */
export interface RuntimeAccess {
	/** Runs one step. */
	step: (step: ManifestStep, values: StepValues) => void;
	/** Runs steps with debug events, and throws what a step throws. */
	phase: (steps: ManifestStep[], context: PhaseContext) => void;
}

/** Checks a nested step the way the parser checks a listed one. */
export type StepCheck = (
	step: unknown,
	list: string,
	depth: number
) => string | undefined;

/** The level 3 part of the manifest runtime. */
export interface LevelThreePart {
	/**
	 * Every step type's fields, level 3 included (`STEP_FIELD_LEVELS`),
	 * which the parser reads in place of its own table.
	 */
	steps: Readonly<Record<string, Readonly<Record<string, number>>>>;
	/**
	 * Why a step that uses a level 3 step type or field is wrong, as the
	 * rest of a parser reason, or `undefined`. Nested steps go through
	 * `check` at `depth + 1`.
	 */
	problem: (
		step: Record<string, unknown>,
		list: string,
		depth: number,
		check: StepCheck
	) => string | undefined;
	/** Runs an `if`, `setFlag`, `listen` or `defer` step. */
	run: (step: ManifestStep, values: StepValues, runtime: RuntimeAccess) => void;
	/**
	 * Called before a call runs: returns what takes the call's result and
	 * runs `steps` once it settles, if the load the call ran in is still
	 * current. The call itself can start another load.
	 */
	settle: (
		steps: ManifestStep[],
		values: StepValues,
		runtime: RuntimeAccess
	) => ((result: unknown) => void) | undefined;
	/**
	 * Adds the bookkeeping level 3 steps read to the script built from
	 * `manifest`. `liveState` returns the state of the registration a
	 * callback belongs to, which is new each time the script is mounted
	 * again after disposal.
	 */
	script: (
		script: Script,
		liveState: () => ScriptState,
		manifest: ResolvedManifest
	) => void;
}

let installed: LevelThreePart | undefined;

/** The level 3 part, once installed. */
export const levelThree = (): LevelThreePart | undefined => installed;

/**
 * Lets the runtime run level 3 manifests with `part`. Scripts built before
 * this call stay as they were.
 */
export const installLevelThree = function installLevelThree(
	part: LevelThreePart
): void {
	installed = part;
};
