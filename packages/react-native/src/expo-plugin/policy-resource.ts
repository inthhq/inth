import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { InthPluginError } from './errors';
import { gvlEntryProblem } from './gvl-fields';

/** The native readers use a fixed filename inside the app's resources/assets. */
export const POLICY_RESOURCE_NAME = 'inth-policy.json';

const PAYLOAD_KEYS = new Set([
	'defaultLanguage',
	'disclosures',
	'endpoint',
	'expiresAt',
	'issuedAt',
	'manifestRevision',
	'policyPacks',
	'requiresAtp',
	'schemaVersion',
	'tenantId',
]);

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const isWholeNumberIn = (value: unknown, min: number, max: number) =>
	Number.isSafeInteger(value) &&
	(value as number) >= min &&
	(value as number) <= max;

/** The native vendor-list gate, and the rule that a list's fetch time precedes issue. */
const gvlProblem = function gvlProblem(
	gvl: unknown,
	issuedAt: number
): string | null {
	if (gvl === undefined) {
		return null;
	}
	const data = isRecord(gvl) ? gvl.data : undefined;
	if (
		!isRecord(gvl) ||
		!isRecord(data) ||
		!isWholeNumberIn(data.vendorListVersion, 1, Number.MAX_SAFE_INTEGER) ||
		!isWholeNumberIn(data.tcfPolicyVersion, 1, Number.MAX_SAFE_INTEGER) ||
		!isRecord(data.purposes) ||
		!isRecord(data.vendors)
	) {
		return 'its vendor list is one devices discard';
	}
	const entry = gvlEntryProblem(data);
	if (entry !== null) {
		return `its vendor list is one devices discard (${entry})`;
	}
	return isWholeNumberIn(gvl.fetchedAt, 0, issuedAt)
		? null
		: 'its vendor list has no fetch time before the issue time';
};

const payloadProblem = function payloadProblem(
	payload: Fields,
	endpoint: string | null,
	now: number
): string | null {
	if (Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key))) {
		return 'it has unsupported fields';
	}
	if (payload.schemaVersion !== 1) {
		return 'its schemaVersion is not 1';
	}
	if (payload.endpoint !== endpoint?.replace(/\/+$/u, '')) {
		return 'it belongs to a different backendURL';
	}
	const { expiresAt, issuedAt } = payload;
	if (!isWholeNumberIn(issuedAt, 0, now)) {
		return 'it is issued in the future or has no valid issue time';
	}
	if (
		!Number.isSafeInteger(expiresAt) ||
		(expiresAt as number) <= (issuedAt as number)
	) {
		return 'it expires before it was issued';
	}
	if (
		typeof payload.manifestRevision !== 'string' ||
		payload.manifestRevision === ''
	) {
		return 'it has no manifest revision';
	}
	if (typeof payload.defaultLanguage !== 'string') {
		return 'it has no default language';
	}
	if (!Array.isArray(payload.policyPacks) || payload.policyPacks.length === 0) {
		return 'it has no policy packs';
	}
	const disclosures = isRecord(payload.disclosures) ? payload.disclosures : {};
	return gvlProblem(disclosures.gvl, issuedAt as number);
};

/**
 * Why a native core would refuse this resource, or `null`. Structural checks
 * only: the plugin cannot load the web policy code, so policy wires and rule
 * matching are left to the CLI, which checks them at export.
 */
export const policyResourceProblem = function policyResourceProblem(
	text: string,
	endpoint: string | null,
	now: number
): string | null {
	let wrapper: unknown;
	try {
		wrapper = JSON.parse(text);
	} catch {
		return 'it is not JSON';
	}
	if (
		!isRecord(wrapper) ||
		Object.keys(wrapper).sort().join(',') !== 'payload,sha256' ||
		typeof wrapper.payload !== 'string' ||
		wrapper.sha256 !==
			createHash('sha256').update(wrapper.payload).digest('hex')
	) {
		return 'its checksum or wrapper is not what the export writes';
	}
	let payload: unknown;
	try {
		payload = JSON.parse(wrapper.payload);
	} catch {
		return 'its payload is not JSON';
	}
	return isRecord(payload)
		? payloadProblem(payload, endpoint, now)
		: 'its payload is not an object';
};

/** Copy an existing build export without changing any policy/disclosure timestamp. */
export const embedPolicyResource = async (
	projectRoot: string,
	source: string,
	endpoint: string | null,
	destination: string
): Promise<void> => {
	const path = resolve(projectRoot, source);
	const text = await readFile(path, 'utf8');
	const now = Date.now();
	const problem = policyResourceProblem(text, endpoint, now);
	if (problem !== null) {
		// An expired resource is usable; one a device would discard is not.
		throw new InthPluginError(
			`policyResource is invalid: ${problem}. Re-export it before prebuild.`
		);
	}
	const { expiresAt } = JSON.parse(JSON.parse(text).payload) as {
		expiresAt: number;
	};
	if (expiresAt <= now) {
		// An expired manifest still prompts and records choices; devices report
		// policyStale until a live /init replaces it.
		console.warn(
			`Inth: ${source} expired on ${new Date(expiresAt).toISOString()}. ` +
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
export const POLICY_RULES_NAME = 'inth-policy-rules.json';

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
