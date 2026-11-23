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
 */

export { InthApiError, isInthApiError } from './inth-api-error';
export type { InthApiErrorCode, InthApiErrorDetail } from './inth-api-error';
export { InthApiSaveRejectedError } from './inth-api-save-rejected-error';
export type { ApiFailure } from './inth-api-save-rejected-error';
export { createV1HostedTransport } from './hosted';
export type { V1HostedTransport, V1HostedTransportOptions } from './hosted';
export { createV1ManifestTransport } from './manifest';
export type {
	V1ManifestReportOptions,
	V1ManifestTransport,
	V1ManifestTransportOptions,
} from './manifest';
export { createV1RecordTransport } from './records';
export type {
	V1LiftOptOutResult,
	V1OptOutResult,
	V1RecordTransport,
	V1RecordTransportOptions,
	V1SaveResult,
} from './records';
export { reportV1ConsentSession } from './v1-session-report.api';
export type { V1SessionReportOptions } from './v1-session-report.api';
