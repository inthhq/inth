import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
		payload.expiresAt <= payload.issuedAt ||
		payload.issuedAt > Date.now()
	) {
		// An expired resource is usable; one that expires before it was issued is not,
		// and both native cores would discard it.
		throw new C15tPluginError(
			'policyResource is invalid, expires before it was issued, is issued in the future, or belongs to a different backendURL. Re-export it before prebuild.'
		);
	}
	if (payload.expiresAt <= Date.now()) {
		// An expired manifest still prompts and records choices; devices report
		// policyStale until a live /init replaces it.
		console.warn(
			`c15t: ${source} expired on ${new Date(payload.expiresAt).toISOString()}. ` +
				'Devices will report policyStale until they reach the backend. Re-export it.'
		);
	}
	await mkdir(dirname(destination), { recursive: true });
	if (path !== destination) {
		await copyFile(path, destination);
	}
};

/** The parts of an Xcode project object this file edits. */
interface PbxObjects {
	[section: string]: Record<string, unknown> | undefined;
}

/**
 * Remove a resource file reference, its build files, and its entries in groups
 * and Resources build phases.
 *
 * The `xcode` package's own `removeResourceFile` assumes a group named
 * `Resources`, which Expo projects do not have.
 */
export const removeXcodeResource = function removeXcodeResource<
	Project extends { hash: { project: { objects: PbxObjects } } },
>(project: Project, filepath: string): Project {
	const { objects } = project.hash.project;
	const unquote = (value: unknown) =>
		typeof value === 'string'
			? value.replace(/^"(?<inner>.*)"$/u, '$<inner>')
			: value;
	const entries = (section: string) =>
		Object.entries(objects[section] ?? {}).filter(
			([key, value]) => !key.endsWith('_comment') && typeof value === 'object'
		) as [string, Record<string, unknown>][];
	const references = entries('PBXFileReference')
		.filter(([, value]) => unquote(value.path) === filepath)
		.map(([key]) => key);
	if (references.length === 0) {
		return project;
	}
	const buildFiles = entries('PBXBuildFile')
		.filter(([, value]) => references.includes(value.fileRef as string))
		.map(([key]) => key);
	for (const [section, keys] of [
		['PBXFileReference', references],
		['PBXBuildFile', buildFiles],
	] as const) {
		for (const key of keys) {
			Reflect.deleteProperty(objects[section] ?? {}, key);
			Reflect.deleteProperty(objects[section] ?? {}, `${key}_comment`);
		}
	}
	const removed = new Set([...references, ...buildFiles]);
	for (const [section, field] of [
		['PBXGroup', 'children'],
		['PBXResourcesBuildPhase', 'files'],
	] as const) {
		for (const [, value] of entries(section)) {
			const list = value[field];
			if (Array.isArray(list)) {
				value[field] = list.filter(
					(item: { value?: string }) => !removed.has(item.value ?? '')
				);
			}
		}
	}
	return project;
};

/** Android app assets location, independent of application ID. */
export const androidPolicyDestination = (root: string): string =>
	join(root, 'android/app/src/main/assets', POLICY_RESOURCE_NAME);

/** The in-code policy's fixed filename inside the app's resources/assets. */
export const POLICY_RULES_NAME = 'c15t-policy-rules.json';

/** Write the in-code policy as `{"rules": [...]}`, the shape both cores read. */
export const writePolicyRules = async (
	destination: string,
	rules: readonly unknown[]
): Promise<void> => {
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, `${JSON.stringify({ rules }, null, 2)}\n`);
};

/** Android assets location of the in-code policy. */
export const androidPolicyRulesDestination = (root: string): string =>
	join(root, 'android/app/src/main/assets', POLICY_RULES_NAME);
