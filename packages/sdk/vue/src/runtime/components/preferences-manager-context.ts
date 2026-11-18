import type { PresentationAction } from '@inth/sdk/engine';
import type { InjectionKey } from 'vue';

import type { ConsentDraft } from '../composables/draft';

/** Manager-owned draft and completion behavior for its inline widget.
 * @internal
 */
export const consentWidgetManagerKey: InjectionKey<{
	draft: ConsentDraft;
	onAction: (action: PresentationAction) => Promise<void>;
}> = Symbol('inth-consent-widget-manager');
