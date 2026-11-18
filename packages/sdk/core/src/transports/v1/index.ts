/**
 * Transports for the `/v1` routes of an Inth backend.
 *
 * - {@link createV1HostedTransport}: the backend picks the policy in
 *   `GET /v1/consent/init`.
 * - {@link createV1ManifestTransport}: init resolves from
 *   `GET /v1/consent/manifest`, and a server-side caller reports to
 *   `POST /v1/consent/sessions`. Server-only.
 * - {@link createV1RecordTransport}: saves and identity links alone, for an
 *   adapter that resolves init some other way.
 *
 * `/v1` requests carry no version or policy-contract header or parameter,
 * and set and read no cookies.
 */

export {
	describeInthApiError,
	InthApiError,
	isInthApiError,
	readInthApiError,
	readInthApiErrorDetail,
} from './error';
export type { InthApiErrorCode, InthApiErrorDetail } from './error';
export { InthConsentSaveRejectedError, readSaveFailure } from './save-rejected';
export type { InthApiFailure } from './save-rejected';
export { createV1HostedTransport } from './hosted';
export type { V1HostedTransport, V1HostedTransportOptions } from './hosted';
export { createV1InitRequest } from './init-request';
export type { V1InitRequest } from './init-request';
export { createV1ManifestTransport } from './manifest';
export type {
	V1ManifestReportOptions,
	V1ManifestTransport,
	V1ManifestTransportOptions,
} from './manifest';
export { buildV1Answer, buildV1ConsentRecordBody } from './records-body';
export type {
	V1ConsentRecordBody,
	V1ConsentRecordBodyOptions,
} from './records-body';
export { createV1RecordTransport } from './records';
export type {
	V1DecisionSource,
	V1RecordTransport,
	V1RecordTransportOptions,
	V1SaveResult,
} from './records';
export {
	buildV1ConsentSessionReport,
	reportV1ConsentSession,
} from './session-report';
export type { V1SessionReportOptions } from './session-report';
