/**
 * The first-load functions the stored save queue calls, passed to
 * `queue.ts` rather than imported there, so the queue loads on demand as one
 * chunk that imports nothing the first load has. The kernel already uses
 * every one of them, so passing them adds no code to first load.
 *
 * Imported by the outbox, never by the queue itself.
 *
 * @internal
 */
import { CONSENT_MODELS } from '@inth/sdk-schema/types';

import {
	isPlainRecord,
	validateExplicitChoice,
} from '../../consent-record/consent-record-validation.model';
import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import { warnInDevelopment } from '../../libs/is-production';
import { generateUuidV7 } from '../../libs/subject-uuid.model';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../transports/consent-save-rejected-error';
import { applySyncedOptOut } from '../kernel-opt-out.model';
import type { QueueTools } from './queue';
import { appendOptOut, appendSave } from './save-outbox.store';
import { toStoredPayload } from './stored-payload.model';
import { withoutSuperseded, withSubjectId } from './supersession.model';

/** @internal */
export const queueTools: QueueTools = {
	appendOptOut,
	appendSave,
	applySyncedOptOut,
	consentModels: CONSENT_MODELS,
	generateUuidV7,
	isConsentSaveRejection,
	isPlainRecord,
	isSubjectConflict,
	optionalCategories: OPTIONAL_CONSENT_CATEGORIES,
	toStoredPayload,
	validateExplicitChoice,
	warnInDevelopment,
	withSubjectId,
	withoutSuperseded,
};
