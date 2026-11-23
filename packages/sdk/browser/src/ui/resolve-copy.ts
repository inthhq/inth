import {
	resolveActionLabels,
	resolveOptOutLink,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
	resolveSurfaceTranslations,
} from '@inth/sdk-core';
import type {
	ConsentSnapshot,
	OptOutLinkVariant,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedOptOutLink,
	Translations,
} from '@inth/sdk-core';
import type { CompleteTranslations } from '@inth/sdk-translations';
import { getTextDirection } from '@inth/sdk-ui/utils';

/** The copy a surface renders from. */
export interface SurfaceCopy {
	/** The resolved bundle, bundled English filling any gaps. */
	t: CompleteTranslations;
	/** Banner title and description for the active policy prompt. */
	prompt: PromptCopy;
	/** Button label for each action. */
	actions: Record<PresentationAction, string>;
	/** Label for each control that opens preferences. */
	controls: Record<PreferenceControl, string>;
	/** Resolved opt-out link presentation for the configured variant. */
	optOutLink: ResolvedOptOutLink;
	/** The resolved language, if the transport reported one. */
	language: string | undefined;
	/** Text direction for the resolved language. */
	dir: 'ltr' | 'rtl';
}

/**
 * Resolve the translations a surface should render.
 *
 * The snapshot's resolved bundle wins, bundled English fills anything it
 * lacks. Prompt copy and labels follow core's order (`consent-copy`), as
 * in the framework surfaces.
 */
export const resolveCopy = function resolveCopy(
	snapshot: ConsentSnapshot,
	optOutLinkVariant?: OptOutLinkVariant
): SurfaceCopy {
	const bundle = snapshot.translations?.translations as
		| Partial<Translations>
		| undefined;
	const language = snapshot.translations?.language;
	return {
		actions: resolveActionLabels(bundle),
		controls: resolvePreferenceControlLabels(bundle),
		dir: getTextDirection(language),
		language,
		optOutLink: resolveOptOutLink(bundle, optOutLinkVariant),
		prompt: resolvePromptCopy(bundle, snapshot.policyRule.prompt),
		t: resolveSurfaceTranslations(snapshot),
	};
};
