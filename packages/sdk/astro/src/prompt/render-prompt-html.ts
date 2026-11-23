/**
 * The server half of the consent prompt: its first-paint
 * stylesheets and its markup as HTML. Only the server render imports it.
 *
 * @internal
 */

import * as bannerSheet from '@inth/sdk/ui/styles/sheets/banner';
import * as buttonSheet from '@inth/sdk/ui/styles/sheets/button';
import * as cardSheet from '@inth/sdk/ui/styles/sheets/card';
import * as gateSheet from '@inth/sdk/ui/styles/sheets/consent-gate';
import * as drawerSheet from '@inth/sdk/ui/styles/sheets/drawer';
import * as surfaceSheet from '@inth/sdk/ui/styles/sheets/surface';
import * as tokensSheet from '@inth/sdk/ui/styles/sheets/tokens';
import * as triggerSheet from '@inth/sdk/ui/styles/sheets/trigger';

import type { StyleSheet } from '../parts/insert-sheets';
import { toHTML } from '../parts/vnode.model';
import type { VElement } from '../parts/vnode.model';
import type { PromptContainerType, PromptModel } from './prompt.model';
import {
	PROMPT_ID_PREFIX,
	promptIds,
	renderPageStatus,
	renderPrompt,
} from './render-prompt';

const CONTAINERS: Record<PromptContainerType, StyleSheet> = {
	banner: bannerSheet,
	card: cardSheet,
	drawer: drawerSheet,
};

/**
 * Lets the `hidden` attribute hide a prerendered prompt, whose own
 * `display` would otherwise beat the user-agent rule.
 */
const HIDDEN_SHEET: StyleSheet = {
	css: '[data-testid=consent-banner-root][hidden]{display:none!important}',
	id: 'inth-astro-hidden-banner',
};

/**
 * The sheets a page inlines once it knows the prompt's container, in
 * cascade order: the tokens, the buttons, the dialog trigger and the
 * ConsentGate placeholder (which a page may also render), the prompt's
 * shell, and the one container it shows. Never another container's.
 *
 * @param container - The desktop layout's container.
 */
export const promptFirstPaintSheets = function promptFirstPaintSheets(
	container: PromptContainerType
): StyleSheet[] {
	return [
		tokensSheet,
		buttonSheet,
		triggerSheet,
		gateSheet,
		surfaceSheet,
		CONTAINERS[container],
		HIDDEN_SHEET,
	];
};

/**
 * The page status region and the collapsed prompt on its desktop layout,
 * as HTML.
 *
 * @param model - From `resolvePromptModel`.
 * @param hidden - Ship it hidden, for a page every visitor shares.
 */
export const renderPromptHTML = function renderPromptHTML(
	model: PromptModel,
	hidden: boolean
): string {
	const tree = renderPrompt(model, {
		expanded: false,
		ids: promptIds(PROMPT_ID_PREFIX),
		layout: model.container.desktop,
		panel: null,
		phase: 'shown',
		status: '',
	});
	const root: VElement = hidden
		? {
				...tree,
				attrs: { ...tree.attrs, 'data-inth-visible': 'false', hidden: '' },
			}
		: tree;
	return toHTML([renderPageStatus(model), root]);
};
