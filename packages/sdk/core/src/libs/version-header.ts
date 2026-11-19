/**
 * Headers every inth-backend-bound request carries.
 *
 * `x-inth-version` (issue #916) is telemetry: it lets the backend attribute
 * traffic to a client version. It is never used to guess what a client can
 * represent.
 *
 * `x-inth-policy-contract` (issue #1025) is the capability declaration: the
 * policy wire contract version this client reads. A producer that speaks a
 * different contract answers with an explicit `unsupported-contract`
 * failure instead of a wire the client would misread, and echoes its own
 * version in the same response header so the client can tell a negotiated
 * producer from one that predates the contract.
 *
 * Scope: every inth-bound request — hosted `/init` + `/subjects`,
 * manifest-mode `/subjects`, the manifest document fetch, the GVL fetch,
 * and the Next/Nuxt server proxies' upstream manifest calls. The manifest
 * and GVL hosts are inth/tenant-controlled infrastructure (IAB TCF policy
 * requires CMPs to self-host the GVL rather than hotlink IAB's), so the
 * headers are safe and version-gated manifest serving stays possible.
 *
 * Two browser `GET` requests are the exception: `GET /init` and the GVL
 * fetch. A browser on another origin sends them as CORS simple requests,
 * because a header would add an `OPTIONS` preflight to every first visit.
 * On `GET /init` the version and the contract travel as the `v` and
 * `contract` query parameters instead ({@link inthProtocolParams}); the
 * backend reads the parameter first and the header second. The browser's
 * GVL fetch carries neither, because the vendor list host doesn't read
 * them. Other requests keep the headers: the browser's manifest fetch
 * needs them for version-gated serving, `/subjects` is a JSON `POST` and
 * is preflighted anyway, and server-side requests have no CORS.
 */
import {
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
} from '@inth/sdk-schema/types';
import type { InitRequestParams } from '@inth/sdk-schema/types';

import { version } from '../version';

export const INTH_VERSION_HEADER = 'x-inth-version';

/** Request header naming the policy contract this client reads. */
export const INTH_POLICY_CONTRACT_HEADER = POLICY_CONTRACT_HEADER;

/** Header record to spread into backend-bound request headers. */
export const inthVersionHeaders: Readonly<Record<string, string>> = {
	[INTH_VERSION_HEADER]: version,
};

/**
 * Version telemetry plus the policy contract declaration, for every
 * backend-bound request.
 */
export const inthProtocolHeaders: Readonly<Record<string, string>> = {
	...inthVersionHeaders,
	[INTH_POLICY_CONTRACT_HEADER]: String(POLICY_CONTRACT_VERSION),
};

/**
 * Version telemetry plus the policy contract declaration, as the query
 * parameters a browser's `GET /init` carries in place of
 * {@link inthProtocolHeaders}.
 */
export const inthProtocolParams: Readonly<
	Pick<InitRequestParams, 'version' | 'policyContract'>
> = {
	policyContract: POLICY_CONTRACT_VERSION,
	version,
};

/**
 * A policy contract header value as {@link readProducerPolicyContract}
 * reads it: `undefined` when absent, `null` when malformed.
 *
 * @internal
 */
export const parsePolicyContract = function parsePolicyContract(
	value: string | null | undefined
): number | null | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
};

/**
 * The policy contract a producer declared on its response, if any.
 *
 * `undefined` means the producer predates the contract (no header). A
 * present but unparseable value is `null`: the producer claims a contract
 * this client cannot even read, which is not the same as claiming none.
 */
export const readProducerPolicyContract = function readProducerPolicyContract(
	headers: Pick<Headers, 'get'> | undefined
): number | null | undefined {
	return parsePolicyContract(headers?.get(INTH_POLICY_CONTRACT_HEADER));
};
