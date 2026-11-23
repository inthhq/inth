/**
 * CMP defaults. Single source of truth for the CMP version Inth reports.
 *
 * There is deliberately no default CMP ID. A CMP ID is assigned by IAB Europe
 * at registration, so a placeholder would produce a TC String that names a
 * provider that is not us. See `cmp-id.model.ts` for the validation that enforces
 * that, and the hosted path, where the backend returns `cmpId` from `/v1/consent/init`.
 *
 * @packageDocumentation
 */

import type { PingData } from '@inth/sdk-core';

import { version } from '../version';

/**
 * CMP version as the integer the TC String and `__tcfapi` report.
 *
 * The TCF `cmpVersion` field is an integer the CMP increments per release, so
 * it carries the package major rather than the full semver string.
 */
export const CMP_VERSION_NUMBER = Number.parseInt(version, 10) || 1;

/**
 * The `ping` answer, for the stub and the loaded CMP alike, so a vendor that
 * pings before and after load reads the same API and CMP versions.
 */
export const createPingData = function createPingData(
	state: Omit<PingData, 'apiVersion' | 'cmpLoaded' | 'cmpVersion'> & {
		cmpVersion: string | number;
	}
): PingData {
	return {
		...state,
		apiVersion: '2.3',
		cmpLoaded: state.cmpStatus === 'loaded',
		cmpVersion: String(state.cmpVersion),
	};
};
