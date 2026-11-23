/**
 * Transports for an Inth project's `/v1` routes, the offline transport, and
 * the types a provider's transport factory works with.
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
} from '../consent-kernel.model';
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
export type { InthApiErrorCode, InthApiErrorDetail } from './v1/inth-api-error';
export { InthApiError, isInthApiError } from './v1/inth-api-error';
export type { V1HostedTransport, V1HostedTransportOptions } from './v1/hosted';
export { createV1HostedTransport } from './v1/hosted';
export type {
	V1RecordTransport,
	V1RecordTransportOptions,
	V1SaveResult,
} from './v1/records';
export { createV1RecordTransport } from './v1/records';
export { InthApiSaveRejectedError } from './v1/inth-api-save-rejected-error';
export type {
	OfflineKernelTransport,
	OfflineTransportOptions,
} from './offline';
export { createOfflineTransport } from './offline';
// Deprecated, kept for `@inth/react-native` only.
export { offline } from './offline';
export type { OfflineModeOptions } from './offline';
export {
	ConsentSaveRejectedError,
	isConsentSaveRejection,
} from './consent-save-rejected-error';
export {
	deferInitGvl,
	createGvlReferenceUrl,
	serveGvlReference,
} from './gvl-reference.model';
