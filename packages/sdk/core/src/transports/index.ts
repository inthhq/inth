/**
 * Transport factories. Each export is optional — consumers pick the one
 * that matches their backend shape. An adapter author who builds their own
 * transport returns a `KernelTransport`: a plain object with optional async
 * `init`, `save` and `identify`, typed by the names re-exported below.
 *
 * Public subpath: `@inth/sdk/transports`.
 */

export type {
	InitContext,
	InitResponse,
	InitResult,
	KernelTransport,
	SavePayload,
	SaveResult,
} from '../types';
export type { HostedKernelTransport, HostedTransportOptions } from './hosted';
export { createHostedTransport } from './hosted';
export type {
	HostedRecordTransport,
	HostedRecordTransportOptions,
} from './hosted-records';
export { createHostedRecordTransport } from './hosted-records';
export type {
	MapInitOutputOptions,
	TransportInitResponse,
} from './init-output';
export {
	initOutputToKernelConfig,
	initResponseToKernelConfig,
	mapInitOutputToInitResponse,
	mapPrivacySignals,
	mergeInitOutputIntoKernelConfig,
	mergeInitResponseIntoKernelConfig,
	resolveInitPolicyWire,
} from './init-output';
export type {
	HostedModeFactory,
	HostedModeOptions,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
} from './mode';
export { hosted } from './mode';
export type { InthApiErrorCode, InthApiErrorDetail } from './v1/error';
export { InthApiError, isInthApiError } from './v1/error';
export type { V1HostedTransport, V1HostedTransportOptions } from './v1/hosted';
export { createV1HostedTransport } from './v1/hosted';
export type {
	V1RecordTransport,
	V1RecordTransportOptions,
	V1SaveResult,
} from './v1/records';
export { createV1RecordTransport } from './v1/records';
export { InthApiSaveRejectedError } from './v1/save-rejected';
export type {
	OfflineKernelTransport,
	OfflineTransportOptions,
} from './offline';
export { createOfflineTransport } from './offline';
// Deprecated, kept for `@inth/react-native` only.
export { offline } from './offline';
export type { OfflineModeOptions } from './offline';
export { custom } from './custom';
export {
	ConsentSaveRejectedError,
	isConsentSaveRejection,
} from './save-rejection';
export type { SubjectPostBody, SubjectSavePayload } from './subject-body';
export { buildConfirmedChoiceWire, buildSubjectPostBody } from './subject-body';
export type {
	MapSubjectRecordOptions,
	TransportHydrationRecords,
} from './subject-record';
export {
	mapSubjectRecordToHydrationRecords,
	reviveSubjectRecord,
} from './subject-record';
export {
	INTH_POLICY_CONTRACT_HEADER,
	INTH_VERSION_HEADER,
	inthProtocolHeaders,
	inthProtocolParams,
	inthVersionHeaders,
	readProducerPolicyContract,
} from '../libs/version-header';
export {
	deferInitGvl,
	createGvlReferenceUrl,
	serveGvlReference,
} from './gvl-reference';
