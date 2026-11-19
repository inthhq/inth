/** Version of the policy wire contract this package produces and reads. */
export const POLICY_CONTRACT_VERSION = 1;

/**
 * Request header a client sends to declare the policy contract version it can
 * represent. `x-inth-version` stays a telemetry header and is never used to
 * guess policy support.
 */
export const POLICY_CONTRACT_HEADER = 'x-inth-policy-contract';
