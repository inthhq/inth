/**
 * Merging an experiment arm over the host presentation and theme, and the
 * per-action appearance every surface derives from its theme.
 *
 * Split from `./experiment` so the code a page needs to render does not
 * share a module with assignment and storage, which the consent engine
 * alone runs. A bundler places whole modules, so before the split a
 * banner's first-load chunk carried the experiment loader too.
 */
import type {
	ConsentExperiment,
	ExperimentActionStyle,
	ExperimentArm,
	ExperimentArmTheme,
	ExperimentAssignment,
} from './experiment';
import type {
	ConsentPresentation,
	PreferencesPresentation,
	PresentationAction,
	PromptPresentation,
} from './policy-actions';

/** The arm that is the host's own `presentation`. Always part of an experiment. */
export const CONTROL_ARM = 'control';

/** What an arm changes; `undefined` for `control` or an unknown arm. */
const armChanges = function armChanges(
	experiment: ConsentExperiment,
	name: string
): ExperimentArm | undefined {
	return name !== CONTROL_ARM && Object.hasOwn(experiment.arms, name)
		? (experiment.arms as Record<string, ExperimentArm>)[name]
		: undefined;
};

const mergeSurface = function mergeSurface<
	Surface extends PromptPresentation | PreferencesPresentation,
>(base: Surface | undefined, arm: Surface | undefined): Surface | undefined {
	if (!base) {
		return arm;
	}
	if (!arm) {
		return base;
	}
	// A key the arm leaves `undefined` is omitted, not a reset: spreading it
	// would wipe the base value.
	const merged = { ...base } as Surface & PreferencesPresentation;
	for (const [key, value] of Object.entries(arm)) {
		if (value !== undefined) {
			(merged as Record<string, unknown>)[key] = value;
		}
	}
	const baseDefaults = (base as PreferencesPresentation).defaults;
	const armDefaults = (arm as PreferencesPresentation).defaults;
	if (baseDefaults && armDefaults) {
		merged.defaults = { ...baseDefaults, ...armDefaults };
	}
	return merged;
};

/**
 * Merge the assigned arm over the host's base presentation.
 *
 * Merges per surface (`prompt`, `preferences`); a key the arm sets wins,
 * everything else comes from `base`. `preferences.defaults` merges per
 * category. `control`, or an arm that no longer exists, returns `base`.
 *
 * @param base - The host's `presentation` option.
 * @param assignment - The arm the subject runs.
 */
export const resolveExperimentPresentation =
	function resolveExperimentPresentation(
		base: ConsentPresentation | undefined,
		experiment: ConsentExperiment,
		assignment: Pick<ExperimentAssignment, 'arm'>
	): ConsentPresentation {
		const arm = armChanges(experiment, assignment.arm);
		if (!arm) {
			return base ?? {};
		}
		const merged: ConsentPresentation = {};
		const prompt = mergeSurface(base?.prompt, arm.prompt);
		if (prompt) {
			merged.prompt = prompt;
		}
		const preferences = mergeSurface(base?.preferences, arm.preferences);
		if (preferences) {
			merged.preferences = preferences;
		}
		return merged;
	};

/**
 * The presentation an adapter renders: the assigned arm merged over `base`,
 * or `base` untouched while no experiment is configured or assigned.
 *
 * @param base - The host's `presentation` option.
 * @param experiment - The `experiment` option, if any.
 * @param assignment - `snapshot.experiment`.
 */
export const applyExperimentAssignment = function applyExperimentAssignment(
	base: ConsentPresentation | undefined,
	experiment: ConsentExperiment | undefined,
	assignment: Pick<ExperimentAssignment, 'id' | 'arm'> | null | undefined
): ConsentPresentation | undefined {
	if (!experiment || !assignment || assignment.id !== experiment.id) {
		return base;
	}
	return resolveExperimentPresentation(base, experiment, assignment);
};

const isTokenGroup = function isTokenGroup(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Merge the assigned arm's theme over the host theme.
 *
 * Top-level keys the arm sets win; a key both sides hold as a plain object
 * (`colors`, `radius`, `consentActions`, ...) merges one level deeper so
 * the arm can change one token and keep the rest. Arrays and scalars are
 * replaced. Returns `base` itself when the arm has no theme or does not
 * exist.
 *
 * @typeParam ThemeType - The host theme type, for example `Theme` from
 * `@inth/sdk/ui/theme`.
 * @param base - The host's `theme` option.
 * @param assignment - The arm the subject runs.
 */
export const resolveExperimentTheme = function resolveExperimentTheme<
	ThemeType extends object,
>(
	base: ThemeType | undefined,
	experiment: ConsentExperiment,
	assignment: Pick<ExperimentAssignment, 'arm'>
): ThemeType | undefined {
	const arm = armChanges(experiment, assignment.arm)?.theme;
	if (!arm) {
		return base;
	}
	if (!base) {
		return arm as ThemeType;
	}
	const baseGroups = base as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...baseGroups };
	for (const [key, value] of Object.entries(arm)) {
		if (value === undefined) {
			continue;
		}
		const current = baseGroups[key];
		merged[key] =
			isTokenGroup(current) && isTokenGroup(value)
				? { ...current, ...value }
				: value;
	}
	return merged as ThemeType;
};

/**
 * The theme an adapter renders: the assigned arm's overrides merged over
 * `base`, or `base` untouched while no experiment is configured or
 * assigned. Mirrors {@link applyExperimentAssignment} for theme tokens.
 *
 * @typeParam ThemeType - The host theme type.
 * @param base - The host's `theme` option.
 * @param experiment - The `experiment` option, if any.
 * @param assignment - `snapshot.experiment`.
 */
export const applyExperimentTheme = function applyExperimentTheme<
	ThemeType extends object,
>(
	base: ThemeType | undefined,
	experiment: ConsentExperiment | undefined,
	assignment: Pick<ExperimentAssignment, 'id' | 'arm'> | null | undefined
): ThemeType | undefined {
	if (!experiment || !assignment || assignment.id !== experiment.id) {
		return base;
	}
	return resolveExperimentTheme(base, experiment, assignment);
};

/** Appearance per action, as `resolveConsentPresentation` consumes it. */
export type ActionAppearance = Partial<
	Record<PresentationAction, ExperimentActionStyle>
>;

/**
 * Derive per-action appearance from `theme.consentActions`, the way the
 * framework adapters do before resolving a surface. `default` is spread
 * under each action. Returns `undefined` when no action is styled, so the
 * prominence check falls back to the policy's own defaults.
 *
 * @param theme - A theme carrying `consentActions`, or nothing.
 * @returns Appearance keyed by action, or `undefined`.
 */
export const actionAppearanceFromTheme = function actionAppearanceFromTheme(
	theme: Pick<ExperimentArmTheme, 'consentActions'> | undefined
): ActionAppearance | undefined {
	const styles = theme?.consentActions;
	if (
		!styles?.accept &&
		!styles?.reject &&
		!styles?.customize &&
		!styles?.dismiss
	) {
		return undefined;
	}
	return {
		accept: { ...styles.default, ...styles.accept },
		customize: { ...styles.default, ...styles.customize },
		dismiss: { ...styles.default, ...styles.dismiss },
		reject: { ...styles.default, ...styles.reject },
	};
};
