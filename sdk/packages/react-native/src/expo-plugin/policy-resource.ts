import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { C15tPluginError } from './errors';

/** The native readers use a fixed filename inside the app's resources/assets. */
export const POLICY_RESOURCE_NAME = 'c15t-policy.json';

/** Copy an existing build export without changing any policy/disclosure timestamp. */
export const embedPolicyResource = async (
	projectRoot: string,
	source: string,
	endpoint: string | null,
	destination: string
): Promise<void> => {
	const path = resolve(projectRoot, source);
	const wrapper = JSON.parse(await readFile(path, 'utf8'));
	const payload = JSON.parse(wrapper.payload);
	if (
		wrapper.sha256 !==
			createHash('sha256').update(wrapper.payload).digest('hex') ||
		payload.schemaVersion !== 1 ||
		payload.endpoint !== endpoint?.replace(/\/+$/u, '') ||
		!Number.isSafeInteger(payload.issuedAt) ||
		!Number.isSafeInteger(payload.expiresAt) ||
		payload.issuedAt > Date.now() ||
		payload.expiresAt <= Date.now()
	) {
		throw new C15tPluginError(
			'policyResource is invalid, expired, or belongs to a different backendURL. Re-export it before prebuild.'
		);
	}
	await mkdir(dirname(destination), { recursive: true });
	if (path !== destination) {
		await copyFile(path, destination);
	}
};

/** Android app assets location, independent of application ID. */
export const androidPolicyDestination = (root: string): string =>
	join(root, 'android/app/src/main/assets', POLICY_RESOURCE_NAME);
