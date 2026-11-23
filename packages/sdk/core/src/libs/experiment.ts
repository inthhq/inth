/**
 * A/B experiments on consent presentation.
 *
 * The host's own `presentation` is the `control` arm. Every other arm is a
 * {@link ConsentPresentation} fragment merged over it. The host passes the
 * arm its feature-flag provider resolved, or a `split` for Inth to pick
 * one. The arm goes out with `/v1/consent/init` and is recorded on the choices of
 * visitors the banner showed it to, so a dashboard can compare opt-in
 * rates per arm. Arms vary presentation and theme tokens only; policy
 * semantics and copy are untouched.
 *
 * This module holds the types and the seed. Merging an arm over the host
 * presentation, and `actionAppearanceFromTheme`, live in
 * `experiment-presentation`, so a first paint carries them without this
 * module and the assignment loader it holds. Assignment and
 * validation live in `experiment-assignment` and `experiment-engine`,
 * loaded on demand.
 */
import type { ConsentKernel, ConsentSnapshot } from '../types';
import type { StorageConfig } from './cookie';
import { CONTROL_ARM } from './experiment-presentation';
import {
	readEarlyExperimentArm,
	readStoredExperimentArm,
	writeEarlyExperimentArm,
	writeStoredExperimentArm,
} from './experiment-storage';
import type { StoredExperimentArm } from './experiment-storage';
import type { ConsentPresentation, PresentationAction } from './policy-actions';

/**
 * Styling of one consent action, the shape `theme.consentActions` uses.
 * Structural so core stays independent of `@inth/sdk/ui`.
 */
export interface ExperimentActionStyle {
	variant?: string;
	mode?: string;
}

/**
 * Theme overrides an arm merges over the host theme.
 *
 * Structurally compatible with `Theme` from `@inth/sdk/ui/theme`: every token
 * group is a plain object merged one level deep, so `colors: { primary }`
 * replaces that colour and keeps the rest of the host palette. Arrays are
 * replaced, not concatenated. `consentActions` is typed because
 * {@link validateExperiment} reads it for the prominence check.
 */
export interface ExperimentArmTheme {
	/** Light-mode colour tokens. */
	colors?: object;
	/** Dark-mode colour tokens. */
	dark?: object;
	/** Typography tokens. */
	typography?: object;
	/** Spacing tokens. */
	spacing?: object;
	/** Radius tokens. */
	radius?: object;
	/** Shadow tokens. */
	shadows?: object;
	/** Motion tokens. */
	motion?: object;
	/** Per-action button styling. Runs through the prominence check. */
	consentActions?: Partial<
		Record<'default' | 'primary' | PresentationAction, ExperimentActionStyle>
	>;
	/** Component slot overrides. */
	slots?: object;
}

/** One arm: a presentation fragment plus optional theme overrides. */
export interface ExperimentArm extends ConsentPresentation {
	/** Theme overrides merged over the host theme for this arm. */
	theme?: ExperimentArmTheme;
}

/**
 * A/B experiment on prompt/preferences presentation.
 *
 * @typeParam Arm - The names of the arms that change something. Inferred
 * when the experiment is built with {@link defineExperiment}, so `arm` and
 * `split` reject a name that is not an arm.
 */
export interface ConsentExperiment<Arm extends string = string> {
	/** Stable experiment identifier, recorded with every choice. */
	id: string;
	/**
	 * What each arm changes, merged over `presentation`. `control` is
	 * always an arm and is your `presentation` as is, so it is not listed.
	 */
	arms: Readonly<Record<Arm, ExperimentArm>>;
	/**
	 * The arm your flag provider resolved for this visitor: `control` or a
	 * key of `arms`. Omit it and set `split` to let Inth pick. An arm that is
	 * not declared logs an error and runs no experiment.
	 */
	arm?: NoInfer<Arm> | typeof CONTROL_ARM;
	/**
	 * How Inth splits visitors when you do not pass `arm`, as relative
	 * weights: `{ control: 60, wall: 40 }`. Default: equal. An arm missing
	 * from the map gets none. Every key must be `control` or an arm.
	 */
	split?: Readonly<Partial<Record<NoInfer<Arm> | typeof CONTROL_ARM, number>>>;
	/**
	 * Run arms that trip presentation diagnostics (for example
	 * `equivalent-prominence-overridden`). Without this, a visitor whose
	 * policy rejects an arm sees `control` and is not counted. The
	 * acknowledgement is recorded on the consent record with the arm.
	 */
	acknowledgeDiagnostics?: boolean;
}

/**
 * Declare an experiment with its arm names inferred, so a misspelled `arm`
 * or `split` key is a type error. Returns its argument.
 *
 * @typeParam Arm - The arm names, inferred from `arms`.
 * @returns `experiment`, unchanged.
 *
 * @example
 * ```ts
 * const bannerShape = defineExperiment({
 *   id: 'banner-shape',
 *   arms: { wall: { prompt: { container: { type: 'card', position: 'center' } } } },
 * });
 *
 * // With a flag: experiment: { ...bannerShape, arm: flagValue }
 * // Without:     experiment: { ...bannerShape, split: { control: 60, wall: 40 } }
 * ```
 */
export const defineExperiment = function defineExperiment<Arm extends string>(
	experiment: ConsentExperiment<Arm>
): ConsentExperiment<Arm> {
	return experiment;
};

/**
 * The arm names an experiment accepts: `control` plus each key of `arms`.
 * Use it to type the flag value you pass as `arm`.
 *
 * @typeParam Experiment - The experiment's type, usually
 * `typeof experiment` for one built with {@link defineExperiment}.
 *
 * @example
 * ```ts
 * const bannerShape = defineExperiment({
 *   id: 'banner-shape',
 *   arms: { wall: { prompt: { container: { type: 'card', position: 'center' } } } },
 * });
 *
 * type BannerShapeArm = ExperimentArmName<typeof bannerShape>;
 * // 'control' | 'wall'
 * ```
 */
export type ExperimentArmName<
	Experiment extends Pick<ConsentExperiment, 'arms'>,
> = typeof CONTROL_ARM | Extract<keyof Experiment['arms'], string>;

/** The arm names of an experiment, `control` first. */
export const experimentArmNames = function experimentArmNames(
	experiment: ConsentExperiment
): string[] {
	return [
		CONTROL_ARM,
		...Object.keys(experiment.arms).filter((name) => name !== CONTROL_ARM),
	];
};

/** Whether `name` is `control` or a declared arm. */
export const isExperimentArm = function isExperimentArm(
	experiment: ConsentExperiment,
	name: string
): boolean {
	return name === CONTROL_ARM || Object.hasOwn(experiment.arms, name);
};

/** The arm a visitor runs, recorded with impressions and choices. */
export interface ExperimentAssignment {
	/** {@link ConsentExperiment.id}. */
	id: string;
	/** `control` or a key of {@link ConsentExperiment.arms}. */
	arm: string;
	/** `host` when the host passed `arm`, `inth` when Inth picked it. */
	assignedBy: 'host' | 'inth';
	/** Whether the host acknowledged presentation diagnostics for this experiment. */
	acknowledgedDiagnostics: boolean;
}

/**
 * An experiment with the arm a server resolved for one request, for a server
 * helper such as `resolveConsent`. The helper counts the arm through `/v1/consent/init`
 * and returns the whole experiment in its state, so the client runs the
 * same definition and arm without configuring it again.
 */
export type ServerExperiment = ConsentExperiment & { arm: string };

/** State a server helper returns, carrying the experiment it resolved. */
export interface ExperimentState {
	/** The experiment and arm the server resolved for this request. */
	experiment?: ServerExperiment;
}

/**
 * The experiment a client runs: the one the server resolved into its state,
 * otherwise the one configured on the client. The server's wins because it
 * is the arm the backend already counted for this visitor.
 *
 * @param configured - The client's `experiment` option.
 * @param state - The server state (`prefetch`), if any.
 * @returns The experiment to run, or `undefined` for none.
 */
export const hostExperiment = function hostExperiment(
	configured: ConsentExperiment | undefined,
	state: ExperimentState | null | undefined
): ConsentExperiment | undefined {
	return state?.experiment ?? configured;
};

/**
 * The `{ id, arm }` a server sends with `/v1/consent/init`: the arm alone, never the
 * presentation each arm carries.
 */
export const experimentArmRef = function experimentArmRef(
	experiment: ServerExperiment
): { id: string; arm: string } {
	return { arm: experiment.arm, id: experiment.id };
};

/**
 * Whether the policy a snapshot resolved lets the visitor run their arm.
 * The kernel asks it in the same commit that resolves a new policy, so the
 * impression that commit stamps already carries the arm the visitor sees.
 */
export type ExperimentGate = (snapshot: ConsentSnapshot) => boolean;

/**
 * What is wrong with an experiment definition, or `null` when nothing is:
 * an `arms` entry named `control`, an undeclared `arm`, or a `split` that
 * names an unknown arm or gives no arm a positive weight.
 *
 * @returns A message naming the problem, or `null`.
 */
export const experimentConfigError = function experimentConfigError(
	experiment: ConsentExperiment
): string | null {
	const label = `inth experiment "${experiment.id}"`;
	if (Object.hasOwn(experiment.arms, CONTROL_ARM)) {
		return `${label}: \`control\` is your \`presentation\`; do not list it in \`arms\`.`;
	}
	if (
		experiment.arm !== undefined &&
		!isExperimentArm(experiment, experiment.arm)
	) {
		return `${label}: arm "${experiment.arm}" is not \`control\` or one of \`arms\`.`;
	}
	if (experiment.arm === undefined && experiment.split) {
		const unknown = Object.keys(experiment.split).filter(
			(name) => !isExperimentArm(experiment, name)
		);
		if (unknown.length > 0) {
			return `${label}: split names ${unknown.map((name) => `"${name}"`).join(', ')}, which ${unknown.length === 1 ? 'is not an arm' : 'are not arms'}.`;
		}
		const total = Object.values(experiment.split).reduce<number>(
			(sum, weight) => sum + Math.max(0, weight ?? 0),
			0
		);
		if (!(total > 0) || !Number.isFinite(total)) {
			return `${label}: split must give at least one arm a finite positive weight.`;
		}
	}
	return null;
};

/**
 * The relative weight of each arm in `names` under `split`: equal without
 * one, and `0` for an arm the split leaves out.
 *
 * @param experiment - A valid experiment definition.
 * @param names - Its arm names, from {@link experimentArmNames}.
 * @returns One weight per name.
 * @internal
 */
export const experimentArmWeights = function experimentArmWeights(
	experiment: ConsentExperiment,
	names: readonly string[]
): number[] {
	const split = experiment.split as
		| Record<string, number | undefined>
		| undefined;
	return names.map((name) =>
		split ? Math.max(0, (Object.hasOwn(split, name) ? split[name] : 0) ?? 0) : 1
	);
};

/**
 * Pick an arm for a visitor Inth assigns: the arm this browser already saw
 * when it still exists, otherwise a weighted random pick over `split`
 * (equal by default). Nothing here is stored; the controller stores the arm
 * once the banner has shown it.
 *
 * @param experiment - A valid experiment definition without `arm`.
 * @param stored - The arm this browser stored, if any.
 * @param random - A number in `[0, 1)`; injectable for tests.
 * @returns The assignment, `assignedBy: 'inth'`.
 */
export const pickExperimentArm = function pickExperimentArm(
	experiment: ConsentExperiment,
	stored: { id: string; arm: string } | null,
	random: number = Math.random()
): ExperimentAssignment {
	const assignment = (arm: string): ExperimentAssignment => ({
		acknowledgedDiagnostics: experiment.acknowledgeDiagnostics === true,
		arm,
		assignedBy: 'inth',
		id: experiment.id,
	});
	if (stored?.id === experiment.id && isExperimentArm(experiment, stored.arm)) {
		return assignment(stored.arm);
	}
	const names = experimentArmNames(experiment);
	const weights = experimentArmWeights(experiment, names);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let point = random * total;
	for (const [index, name] of names.entries()) {
		point -= weights[index] ?? 0;
		if (point < 0) {
			return assignment(name);
		}
	}
	return assignment(names.at(-1) ?? CONTROL_ARM);
};

/**
 * The arm Inth starts from: the one this page's early `/v1/consent/init` picked, else
 * the one this browser stored. Either only when it is an arm of
 * `experiment`.
 */
const knownArm = function knownArm(
	experiment: ConsentExperiment,
	storageConfig?: StorageConfig
): StoredExperimentArm | null {
	const early = readEarlyExperimentArm();
	return early?.id === experiment.id && isExperimentArm(experiment, early.arm)
		? early
		: readStoredExperimentArm(storageConfig);
};

/**
 * The arm a request sent before the runtime starts carries: the host `arm`,
 * else this page's early arm, the stored arm or a new pick under
 * {@link pickExperimentArm}. Recorded for the runtime, which runs the same
 * arm. The inline prefetch script does the same.
 *
 * @returns The arm, or `undefined` for an invalid definition or outside a
 * browser.
 * @internal
 */
export const claimEarlyExperimentArm = function claimEarlyExperimentArm(
	experiment: ConsentExperiment
): StoredExperimentArm | undefined {
	if (typeof window === 'undefined' || experimentConfigError(experiment)) {
		return undefined;
	}
	const claimed = {
		arm:
			experiment.arm ?? pickExperimentArm(experiment, knownArm(experiment)).arm,
		id: experiment.id,
	};
	writeEarlyExperimentArm(claimed);
	return claimed;
};

/**
 * The kernel seed for an experiment, known before any render.
 *
 * - A server prefetch that already rendered an arm of this experiment
 *   (the Astro middleware, a server seed) keeps it: the visitor saw it.
 * - Otherwise a host `arm` is the arm.
 * - Otherwise Inth picks one in the browser when the runtime starts.
 *
 * The prompt is held until the controller has checked the arm against the
 * visitor's policy, so the banner never swaps from one presentation to
 * another in front of the visitor. The one exception is a known arm the
 * server already rendered (`rendered`): that banner is on screen, and
 * hiding it to check it would be the swap this avoids.
 *
 * An invalid definition logs an error and runs no experiment rather than
 * failing the page.
 *
 * @param experiment - The `experiment` option, if any.
 * @param prefetched - `initialExperiment` from a server prefetch, if any.
 * @param rendered - The server resolved the policy and rendered the prompt
 * from this snapshot.
 * @returns Kernel config fields to spread into `createConsentKernel`.
 * @internal
 */
export const seedExperiment = function seedExperiment(
	experiment: ConsentExperiment | undefined,
	prefetched?: ExperimentAssignment | null,
	rendered = false
): {
	initialExperiment?: ExperimentAssignment;
	initialExperimentPending?: true;
} {
	if (!experiment) {
		return {};
	}
	const configError = experimentConfigError(experiment);
	if (configError) {
		console.error(`${configError} No experiment runs.`);
		return {};
	}
	const acknowledgedDiagnostics = experiment.acknowledgeDiagnostics === true;
	let initialExperiment: ExperimentAssignment | undefined;
	if (
		prefetched?.id === experiment.id &&
		isExperimentArm(experiment, prefetched.arm)
	) {
		initialExperiment = { ...prefetched, acknowledgedDiagnostics };
	} else if (experiment.arm !== undefined) {
		initialExperiment = {
			acknowledgedDiagnostics,
			arm: experiment.arm,
			assignedBy: 'host',
			id: experiment.id,
		};
	}
	if (initialExperiment && rendered) {
		return { initialExperiment };
	}
	return initialExperiment
		? { initialExperiment, initialExperimentPending: true }
		: { initialExperimentPending: true };
};

/** Inputs of {@link startExperiment}. */
export interface StartExperimentOptions {
	experiment: ConsentExperiment;
	kernel: ConsentKernel;
	/** The host's base presentation each arm is merged over. */
	presentation?: ConsentPresentation;
	/** The host theme each arm's `theme` is merged over for validation. */
	theme?: ExperimentArmTheme;
	storageConfig?: StorageConfig;
}

/**
 * Run the experiment on a started runtime. Call it after hydration and
 * before `init()`.
 *
 * When Inth picks the arm, it does so here, synchronously, so the `/v1/consent/init`
 * that follows already carries it. An arm this page's early `/v1/consent/init` sent
 * wins, so the banner runs the arm that request counted. Then the controller loads as its own
 * chunk, checks the arm against the visitor's policy and releases the held
 * prompt. A site pays for the controller only when it runs an experiment.
 * A failed load runs no experiment and still releases the prompt, so a
 * visitor is never left without a banner.
 *
 * @returns Detach the controller.
 * @internal
 */
export const startExperiment = function startExperiment(
	options: StartExperimentOptions
): () => void {
	const { experiment, kernel } = options;
	if (experimentConfigError(experiment)) {
		// `seedExperiment` already reported it; release anything held.
		kernel.set.experiment(null);
		return () => undefined;
	}
	if (!kernel.getSnapshot().experiment && experiment.arm === undefined) {
		kernel.set.experiment(
			pickExperimentArm(experiment, knownArm(experiment, options.storageConfig))
		);
	}
	let detach: (() => void) | null = null;
	let stopped = false;
	const attach = async (): Promise<void> => {
		try {
			const { createExperimentControllerWith } =
				await import('./experiment-assignment');
			if (!stopped) {
				detach = createExperimentControllerWith(
					options,
					writeStoredExperimentArm
				).dispose;
			}
		} catch (failure) {
			console.error(
				`inth experiment "${experiment.id}": the experiment module failed to load, so no experiment runs.`,
				failure
			);
			if (!stopped) {
				kernel.set.experiment(null);
			}
		}
	};
	void attach();
	return () => {
		stopped = true;
		detach?.();
	};
};
