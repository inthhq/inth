// Promise chains, not async functions: this module is on first load, and
// the async form costs bytes there.
/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks, promise/prefer-catch */
/**
 * The stock banner: the consent prompt for the resolved container (Card,
 * Banner or Drawer), loaded once a choice is owed. It stays mounted after,
 * so its exit, the page announcement and the focus return outlive it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk-core';

import type { ConsentBannerOptions } from '../../consent-client.model';
import { importPresentation } from '../parts/load';
import { resolveActions } from '../render-action-footer';
import type { Surface, SurfaceContext } from '../surface';
import type {
	PromptActionGroups,
	PromptContainer,
	PromptSurface,
} from './create-prompt-surface';

/** The banner options that shape the prompt's container. */
const containerOverride = (options: ConsentBannerOptions) => ({
	blockUntilChoice: options.blockUntilChoice,
	container: options.container,
	edgeStyle: options.edgeStyle,
});

/**
 * The prompt's container and the first-layer actions the policy allows,
 * or `null` when the policy has no prompt to show.
 */
export const resolvePrompt = function resolvePrompt(
	ctx: SurfaceContext,
	snapshot: ConsentSnapshot,
	options: ConsentBannerOptions = {}
): {
	container: PromptContainer;
	actionGroups: PromptActionGroups;
} | null {
	const resolved = resolveActions(
		snapshot,
		'prompt',
		ctx.client.presentation,
		containerOverride(options),
		ctx.client.theme
	);
	return resolved.container
		? { actionGroups: resolved.actionGroups, container: resolved.container }
		: null;
};

const reportLoadError = (error: unknown): void => {
	// oxlint-disable-next-line no-console -- The prompt failed to load.
	console.error('@inth/sdk: the consent banner failed to load.', error);
};

/**
 * The stock banner. The prompt for the resolved container loads once a
 * choice is owed; a failed load is reported and the next update tries
 * again.
 */
export const createBannerSurface = function createBannerSurface(
	ctx: SurfaceContext,
	options: ConsentBannerOptions
): Surface {
	let prompt: PromptSurface | null = null;
	let promptType: string | null = null;
	let loadingType: string | null = null;
	/** Counts loads, so a load a newer one replaced is ignored. */
	let loads = 0;
	let latest: {
		snapshot: ConsentSnapshot;
		container: PromptContainer;
		actionGroups: PromptActionGroups;
	} | null = null;
	let owed = false;
	let destroyed = false;

	const load = function load(type: PromptContainer['desktop']['type']): void {
		if (loadingType === type) {
			return;
		}
		loadingType = type;
		loads += 1;
		const ticket = loads;
		importPresentation(type).then(
			(module) => {
				if (destroyed || ticket !== loads) {
					return;
				}
				loadingType = null;
				prompt?.destroy();
				prompt = module.createSurface(ctx, options);
				promptType = type;
				if (latest) {
					prompt.sync(latest.snapshot, latest.container, latest.actionGroups);
				}
			},
			(error: unknown) => {
				reportLoadError(error);
				if (ticket === loads) {
					// The next sync tries again.
					loadingType = null;
				}
			}
		);
	};

	return {
		destroy() {
			destroyed = true;
			prompt?.destroy();
			prompt = null;
		},
		sync(snapshot) {
			const resolved = resolvePrompt(ctx, snapshot, options);
			if (!resolved) {
				latest = null;
				prompt?.hide();
				return;
			}
			const { actionGroups, container } = resolved;
			latest = { actionGroups, container, snapshot };
			owed ||= snapshot.activeUI === 'banner';
			if (!owed) {
				return;
			}
			const { type } = container.desktop;
			prompt?.sync(snapshot, container, actionGroups);
			if (promptType !== type) {
				load(type);
			}
		},
	};
};
