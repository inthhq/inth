/**
 * `check` and `accept` of `@inth/sdk/runtime/documents`. They load on
 * their first call, through `runtime/lazy-documents.ts`.
 *
 * @internal
 */
import type {
	V1DocumentAcceptanceItem,
	V1DocumentAcceptancesOutput,
} from '@inth/sdk-schema/types';

import type { InternalKernel } from '../kernel/internals';
import { localStorageOf } from '../libs/local-storage';
import { DOCUMENT_ACCEPTANCES_STORAGE_KEY } from '../libs/storage-keys';
import { createIdempotencyKey, generateUuidV7 } from '../libs/subject-uuid';
import type {
	AcceptDocumentsOptions,
	DocumentCheck,
} from '../runtime/documents';
import type { ConsentRuntime, StreamedPrefetch } from '../runtime/types';
import { isInthApiError } from '../transports/v1/error';
import { resolveProperty, trimTrailingSlash } from '../transports/v1/routes';
import { createDocumentsClient } from './client';

/** Larger stored values are ignored, and replaced on the next write. */
const MAX_STORED_LENGTH = 64 * 1024;

type AcceptedHashes = Record<string, { version: string; acceptedAt: number }>;

/**
 * What this browser stores under `DOCUMENT_ACCEPTANCES_STORAGE_KEY`.
 * Persistence starts a reload from `subjectId` when no consent record
 * carries a subject, and a clear removes the key.
 */
interface StoredAcceptances {
	/** The subject the latest acceptance was recorded for. */
	subjectId: string;
	/** By {@link scopeOf}, the hashes accepted of each document type. */
	accepted: Record<string, Record<string, AcceptedHashes>>;
}

const scopeOf = (projectUrl: string, subjectId: string): string =>
	`${subjectId} ${projectUrl}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const readStored = function readStored(): StoredAcceptances | null {
	try {
		const raw = localStorageOf()?.getItem(DOCUMENT_ACCEPTANCES_STORAGE_KEY);
		if (!raw || raw.length > MAX_STORED_LENGTH) {
			return null;
		}
		const value: unknown = JSON.parse(raw);
		return isRecord(value) &&
			typeof value.subjectId === 'string' &&
			isRecord(value.accepted)
			? (value as unknown as StoredAcceptances)
			: null;
	} catch {
		return null;
	}
};

const write = function write(stored: StoredAcceptances): void {
	let text = JSON.stringify(stored);
	if (text.length > MAX_STORED_LENGTH) {
		const scope = Object.keys(stored.accepted).at(-1);
		text = JSON.stringify({
			accepted: scope ? { [scope]: stored.accepted[scope] } : {},
			subjectId: stored.subjectId,
		});
	}
	try {
		localStorageOf()?.setItem(DOCUMENT_ACCEPTANCES_STORAGE_KEY, text);
	} catch {
		// The backend recorded it; this browser asks again next time.
	}
};

/**
 * Read, change and write the stored acceptances under a Web Lock, so tabs
 * writing at once each keep what the others wrote.
 */
const update = async function update(
	change: (stored: StoredAcceptances | null) => StoredAcceptances | null
): Promise<void> {
	const run = () => {
		const next = change(readStored());
		if (next) {
			write(next);
		}
	};
	try {
		const { locks } = navigator;
		if (typeof locks?.request === 'function') {
			await locks.request(DOCUMENT_ACCEPTANCES_STORAGE_KEY, run);
			return;
		}
	} catch {
		// No usable lock: write without one.
	}
	run();
};

/** The hashes of `type` accepted in `scope`; none when nothing is stored. */
const acceptedHashes = function acceptedHashes(
	scope: string,
	type: string
): AcceptedHashes {
	const accepted = readStored()?.accepted;
	const types =
		accepted && Object.hasOwn(accepted, scope) ? accepted[scope] : undefined;
	const hashes =
		isRecord(types) && Object.hasOwn(types, type) ? types[type] : undefined;
	return isRecord(hashes) ? hashes : {};
};

const following = new WeakSet<InternalKernel>();

/**
 * Move the stored acceptances with the kernel's subject when the backend
 * replaces it (a link, a save's answer, a conflict), for as long as this
 * page runs. Persistence does not announce replacing an ID acceptances
 * were recorded for.
 */
const followSubject = function followSubject(kernel: InternalKernel): void {
	if (following.has(kernel)) {
		return;
	}
	following.add(kernel);
	kernel.events.on('subject:resolved', ({ previousSubjectId, snapshot }) => {
		const subjectId = snapshot.subject?.subjectId;
		if (!(previousSubjectId && subjectId)) {
			return;
		}
		void update((stored) => {
			if (!stored) {
				return null;
			}
			const accepted: StoredAcceptances['accepted'] = {};
			for (const [scope, types] of Object.entries(stored.accepted)) {
				const [owner, ...project] = scope.split(' ');
				accepted[
					owner === previousSubjectId
						? scopeOf(project.join(' '), subjectId)
						: scope
				] = types;
			}
			return {
				accepted,
				subjectId:
					stored.subjectId === previousSubjectId ? subjectId : stored.subjectId,
			};
		});
	});
};

/**
 * The backend consent records go to, and the kernel that holds the
 * visitor's subject.
 */
const bind = function bind(runtime: ConsentRuntime) {
	const kernel = runtime.kernel as InternalKernel;
	const backend = kernel.backend?.();
	if (!backend) {
		throw new Error(
			'Inth documents: legal documents need a backend, and this runtime has none. A testing() or offline mode, a disabled provider and a stand-in runtime have none.'
		);
	}
	followSubject(kernel);
	const projectUrl = trimTrailingSlash(backend.projectUrl);
	return {
		client: createDocumentsClient({ fetch: backend.fetch, projectUrl }),
		kernel,
		projectUrl,
		property: resolveProperty(projectUrl, backend.property),
	};
};

/**
 * Wait until the runtime's subject is the one it keeps: a streamed
 * prefetch, and the first init, can still replace the ID it starts with.
 */
const subjectSettled = async function subjectSettled(
	runtime: ConsentRuntime
): Promise<void> {
	await (runtime as { streamed?: StreamedPrefetch }).streamed?.settled;
	const { kernel } = runtime;
	if (!(runtime.started && kernel.getSnapshot().policyPending)) {
		return;
	}
	await new Promise<void>((resolve) => {
		const unsubscribers: (() => void)[] = [];
		const stop = (): void => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
			resolve();
		};
		unsubscribers.push(
			kernel.subscribe(() => {
				if (!kernel.getSnapshot().policyPending) {
					stop();
				}
			}),
			kernel.events.on('command:init:completed', stop)
		);
	});
};

export const checkDocument = async function checkDocument(
	runtime: ConsentRuntime,
	type: string
): Promise<DocumentCheck> {
	const { client, kernel, projectUrl } = bind(runtime);
	const { document } = await client.getCurrent(type);
	const subjectId = kernel.getSnapshot().subject?.subjectId;
	// The current hash is checked against the hash pattern on the way in,
	// so only a well-formed stored hash can match it.
	return {
		accepted:
			subjectId !== undefined &&
			Object.hasOwn(
				acceptedHashes(scopeOf(projectUrl, subjectId), type),
				document.hash
			),
		document,
	};
};

export const acceptDocuments = async function acceptDocuments(
	runtime: ConsentRuntime,
	documents: V1DocumentAcceptanceItem | readonly V1DocumentAcceptanceItem[],
	options: AcceptDocumentsOptions = {}
): Promise<V1DocumentAcceptancesOutput> {
	const { client, kernel, projectUrl, property } = bind(runtime);
	await subjectSettled(runtime);
	let subjectId = kernel.getSnapshot().subject?.subjectId;
	if (!subjectId) {
		subjectId = generateUuidV7();
		kernel.set.subjectId(subjectId);
	}
	const input = {
		acceptances: 'hash' in documents ? [documents] : documents,
		externalId: options.externalId,
		idempotencyKey: options.idempotencyKey ?? createIdempotencyKey(),
		identityProvider: options.identityProvider,
		identityToken: options.identityToken,
		property,
	};
	let answer: V1DocumentAcceptancesOutput;
	try {
		answer = await client.recordAcceptances({ ...input, subjectId });
	} catch (error) {
		if (!(isInthApiError(error) && error.code === 'subject_conflict')) {
			throw error;
		}
		// Another project holds the ID. Move to a new one, as a refused
		// consent save does, and send the same action under it.
		const conflicted = subjectId;
		subjectId = generateUuidV7();
		await kernel.adoptSubject(conflicted, subjectId);
		answer = await client.recordAcceptances({ ...input, subjectId });
	}
	// For a device the answer names its canonical ID, which replaces a
	// stored `sub_` ID. For a person it names the person, and the device
	// keeps its own.
	if (!input.externalId && answer.subjectId !== subjectId) {
		await kernel.adoptSubject(subjectId, answer.subjectId);
		({ subjectId } = answer);
	}
	// Stored with the acceptances, the ID outlives this page.
	if (kernel.getProvisionalSubject() === subjectId) {
		kernel.markProvisionalSubject(null);
	}
	const device = subjectId;
	const scope = scopeOf(projectUrl, device);
	await update((stored) => {
		// The scope written last goes last: a value over the size limit
		// keeps it alone.
		const accepted: StoredAcceptances['accepted'] = {};
		for (const [key, types] of Object.entries(stored?.accepted ?? {})) {
			if (key !== scope) {
				accepted[key] = types;
			}
		}
		const types: Record<string, AcceptedHashes> = {};
		const previous = stored?.accepted[scope];
		if (stored && Object.hasOwn(stored.accepted, scope) && isRecord(previous)) {
			Object.assign(types, previous);
		}
		for (const { acceptedAt, hash, type, version } of answer.acceptances) {
			const hashes: AcceptedHashes = {};
			if (Object.hasOwn(types, type) && isRecord(types[type])) {
				Object.assign(hashes, types[type]);
			}
			hashes[hash] = { acceptedAt, version };
			types[type] = hashes;
		}
		accepted[scope] = types;
		return { accepted, subjectId: device };
	});
	return answer;
};
