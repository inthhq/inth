/**
 * Headers a server sends when it fetches the Global Vendor List or the
 * Google ad tech provider list a manifest references: the SDK version as
 * `x-inth-version`, and the policy contract this client reads as
 * `x-inth-policy-contract`. Those hosts can serve by version. A browser's
 * vendor list fetch sends neither, so it stays a CORS simple request.
 */
import {
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
} from '@inth/sdk-schema/types';

import { version } from '../version';

export const inthProtocolHeaders: Readonly<Record<string, string>> = {
	'x-inth-version': version,
	[POLICY_CONTRACT_HEADER]: String(POLICY_CONTRACT_VERSION),
};
