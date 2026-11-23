/**
 * The server half of the Privacy Choices prompt: its first-paint
 * stylesheets and its markup as HTML. Only the server render imports it.
 *
 * @internal
 */

import * as barSheet from '@inth/sdk/ui/styles/sheets/banner';
import * as buttonSheet from '@inth/sdk/ui/styles/sheets/button';
import * as cardSheet from '@inth/sdk/ui/styles/sheets/card';
import * as gateSheet from '@inth/sdk/ui/styles/sheets/consent-gate';
import * as drawerSheet from '@inth/sdk/ui/styles/sheets/drawer';
import * as surfaceSheet from '@inth/sdk/ui/styles/sheets/surface';
import * as tokensSheet from '@inth/sdk/ui/styles/sheets/tokens';
import * as triggerSheet from '@inth/sdk/ui/styles/sheets/trigger';

import type { PrivacyChoicesModel, PrivacyChoicesPresentation } from './model';
import type { PrivacyChoicesSheet } from './sheets';
import {
	PRIVACY_CHOICES_ID_PREFIX,
	promptIds,
	renderPageStatus,
	renderPrompt,
} from './view';
import { toHTML } from './vnode';
import type { VElement } from './vnode';

const PRESENTATIONS: Record<PrivacyChoicesPresentation, PrivacyChoicesSheet> = {
	bar: barSheet,
	card: cardSheet,
	drawer: drawerSheet,
};

/**
 * Lets the `hidden` attribute hide a prerendered prompt, whose own
 * `display` would otherwise beat the user-agent rule.
 */
const HIDDEN_SHEET: PrivacyChoicesSheet = {
	css: '[data-testid=consent-banner-root][hidden]{display:none!important}',
	id: 'inth-astro-hidden-banner',
};

/**
 * The sheets a Privacy Choices page inlines, in cascade order: the
 * tokens, the buttons, the dialog trigger and the ConsentGate placeholder
 * (which the classic first-paint sheet would have carried), the prompt's
 * shell, and the one presentation it shows. Never another presentation's.
 *
 * @param presentation - The desktop container's presentation.
 */
export const privacyChoicesFirstPaintSheets =
	function privacyChoicesFirstPaintSheets(
		presentation: PrivacyChoicesPresentation
	): PrivacyChoicesSheet[] {
		return [
			tokensSheet,
			buttonSheet,
			triggerSheet,
			gateSheet,
			surfaceSheet,
			PRESENTATIONS[presentation],
			HIDDEN_SHEET,
		];
	};

/**
 * The page status region and the collapsed prompt on its desktop layout,
 * as HTML.
 *
 * @param model - From `resolvePrivacyChoicesModel`.
 * @param hidden - Ship it hidden, for a page every visitor shares.
 */
export const renderPrivacyChoicesHTML = function renderPrivacyChoicesHTML(
	model: PrivacyChoicesModel,
	hidden: boolean
): string {
	const tree = renderPrompt(model, {
		expanded: false,
		ids: promptIds(PRIVACY_CHOICES_ID_PREFIX),
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
