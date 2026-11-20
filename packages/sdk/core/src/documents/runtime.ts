/**
 * `check` and `accept` of `@inth/sdk/runtime/documents`. They load on
 * their first call, through `runtime/lazy-documents.ts`.
 *
 * Documents never create, store or replace the visitor's subject: consent
 * persistence owns it. An acceptance is remembered for the subject it was
 * recorded under, for this page, and across reloads only while consent
 * persistence keeps that subject (the visitor has a consent record). When
 * the subject changes, the remembered acceptances no longer match.
 *
 * @internal
 */
import {
	V1_DOCUMENT_HASH_PATTERN,
	V1_LEGACY_SUBJECT_ID_PATTERN,
} from '@inth/sdk-schema/types';
import type {
	V1DocumentAcceptanceItem,
	V1DocumentAcceptancesOutput,
} from '@inth/sdk-schema/types';

import type { InternalKernel } from '../kernel/internals';
import { localStorageOf } from '../libs/local-storage';
import { DOCUMENT_ACCEPTANCES_STORAGE_KEY } from '../libs/storage-keys';
import { createIdempotencyKey } from '../libs/subject-uuid';
import type {
	AcceptDocumentsOptions,
	DocumentCheck,
} from '../runtime/documents';
import type { ConsentRuntime, StreamedPrefetch } from '../runtime/types';
import {
	isUuidV7,
	resolveProperty,
	trimTrailingSlash,
} from '../transports/v1/routes';
import type { ConsentSnapshot } from '../types';
import { createDocumentsClient } from './client';

/** Larger entries read as nothing. The writer stays below it. */
const MAX_ENTRY_LENGTH = 16 * 1024;
/** What one entry keeps: the latest types, and their latest hashes. */
const MAX_TYPES = 16;
const MAX_HASHES = 4;

interface Accepted {
	version: string;
	acceptedAt: number;
}

/** The acceptances of one subject for one project: by type, by hash. */
interface Entry {
	subjectId: string;
	accepted: Record<string, Record<string, Accepted>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSubjectId = (value: unknown): value is string =>
	typeof value === 'string' &&
	(isUuidV7(value) || V1_LEGACY_SUBJECT_ID_PATTERN.test(value));

const isAccepted = (value: unknown): value is Accepted =>
	isRecord(value) &&
	typeof value.version === 'string' &&
	typeof value.acceptedAt === 'number';

/**
 * The one reader of a stored or remembered entry. A wrong shape, a
 * malformed subject or hash, missing metadata, more than the writer keeps
 * or more than the size limit reads as nothing.
 */
const readEntry = function readEntry(
	text: string | null | undefined
): Entry | null {
	if (!text || text.length > MAX_ENTRY_LENGTH) {
		return null;
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (
		!(
			isRecord(value) &&
			isSubjectId(value.subjectId) &&
			isRecord(value.accepted)
		)
	) {
		return null;
	}
	const types = Object.values(value.accepted);
	if (types.length > MAX_TYPES) {
		return null;
	}
	for (const hashes of types) {
		if (!isRecord(hashes) || Object.keys(hashes).length > MAX_HASHES) {
			return null;
		}
		for (const [hash, accepted] of Object.entries(hashes)) {
			if (!(V1_DOCUMENT_HASH_PATTERN.test(hash) && isAccepted(accepted))) {
				return null;
			}
		}
	}
	return value as unknown as Entry;
};

/** Newest first, by when the latest of `items` was accepted. */
const newestFirst = <Item>(
	items: [string, Item][],
	at: (item: Item) => number
): [string, Item][] =>
	[...items].sort((left, right) => at(right[1]) - at(left[1]));

const latestOf = (hashes: Record<string, Accepted>): number =>
	Math.max(...Object.values(hashes).map((accepted) => accepted.acceptedAt));

/**
 * `entry` with `acceptances` added, cut to what an entry keeps, as text
 * the reader accepts; `null` when even the newest acceptance alone is too
 * large.
 */
const writeEntry = function writeEntry(
	entry: Entry,
	acceptances: V1DocumentAcceptancesOutput['acceptances']
): string | null {
	const accepted: Entry['accepted'] = {};
	for (const [type, hashes] of Object.entries(entry.accepted)) {
		accepted[type] = { ...hashes };
	}
	for (const { acceptedAt, hash, type, version } of acceptances) {
		accepted[type] = {
			...(Object.hasOwn(accepted, type) ? accepted[type] : undefined),
			[hash]: { acceptedAt, version },
		};
	}
	let kept = newestFirst(Object.entries(accepted), latestOf)
		.slice(0, MAX_TYPES)
		.map(([type, hashes]): [string, Record<string, Accepted>] => [
			type,
			Object.fromEntries(
				newestFirst(Object.entries(hashes), (item) => item.acceptedAt).slice(
					0,
					MAX_HASHES
				)
			),
		]);
	while (kept.length > 0) {
		const text = JSON.stringify({
			accepted: Object.fromEntries(kept),
			subjectId: entry.subjectId,
		} satisfies Entry);
		if (text.length <= MAX_ENTRY_LENGTH) {
			return text;
		}
		kept = kept.slice(0, -1);
	}
	return null;
};

/** What each runtime's page remembers, by storage key, as stored text. */
const pages = new WeakMap<InternalKernel, Map<string, string>>();

const rememberedOf = function rememberedOf(
	kernel: InternalKernel
): Map<string, string> {
	let remembered = pages.get(kernel);
	if (!remembered) {
		remembered = new Map();
		pages.set(kernel, remembered);
	}
	return remembered;
};

/** Whether consent persistence keeps the subject: a consent record exists. */
const hasConsentRecord = (snapshot: ConsentSnapshot): boolean =>
	Boolean(
		snapshot.explicitChoice || snapshot.vendorChoice || snapshot.noticeDismissal
	);

const readStored = function readStored(key: string): Entry | null {
	try {
		return readEntry(localStorageOf()?.getItem(key));
	} catch {
		return null;
	}
};

/** Run `write` under a Web Lock on `key`, so tabs do not lose each other's. */
const locked = async function locked(
	key: string,
	write: () => void
): Promise<void> {
	try {
		const { locks } = navigator;
		if (typeof locks?.request === 'function') {
			await locks.request(key, write);
			return;
		}
	} catch {
		// No usable lock: write without one.
	}
	write();
};

const forgetting = new WeakSet<InternalKernel>();

/**
 * A clear forgets what this page and storage remember for the subject it
 * cleared. A clear before the documents code loaded leaves no consent
 * record, so a stored entry does not count until one is made again.
 */
const forgetOnClear = function forgetOnClear(
	kernel: InternalKernel,
	key: string
): void {
	if (forgetting.has(kernel)) {
		return;
	}
	forgetting.add(kernel);
	kernel.events.on('records:cleared', () => {
		const subjectId = kernel.getSnapshot().subject?.subjectId;
		const remembered = rememberedOf(kernel);
		if (readEntry(remembered.get(key))?.subjectId === subjectId) {
			remembered.delete(key);
		}
		void locked(key, () => {
			if (readStored(key)?.subjectId === subjectId) {
				try {
					localStorageOf()?.removeItem(key);
				} catch {
					// Without a consent record it no longer counts.
				}
			}
		});
	});
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

/** The backend consent records go to, once the subject has settled. */
const bind = async function bind(runtime: ConsentRuntime) {
	await subjectSettled(runtime);
	const kernel = runtime.kernel as InternalKernel;
	const backend = kernel.backend?.();
	if (!backend) {
		throw new Error(
			'Inth documents: legal documents need a backend, and this runtime has none. A testing() or offline mode, a disabled provider and a stand-in runtime have none.'
		);
	}
	const projectUrl = trimTrailingSlash(backend.projectUrl);
	const key = `${DOCUMENT_ACCEPTANCES_STORAGE_KEY}:${projectUrl}`;
	forgetOnClear(kernel, key);
	return {
		client: createDocumentsClient({ fetch: backend.fetch, projectUrl }),
		kernel,
		key,
		property: resolveProperty(projectUrl, backend.property),
	};
};

export const checkDocument = async function checkDocument(
	runtime: ConsentRuntime,
	type: string
): Promise<DocumentCheck> {
	const { client, kernel, key } = await bind(runtime);
	const { document } = await client.getCurrent(type);
	const snapshot = kernel.getSnapshot();
	const subjectId = snapshot.subject?.subjectId;
	const counts = (entry: Entry | null): boolean =>
		entry !== null &&
		entry.subjectId === subjectId &&
		Object.hasOwn(entry.accepted, type) &&
		Object.hasOwn(entry.accepted[type] ?? {}, document.hash);
	return {
		accepted:
			counts(readEntry(rememberedOf(kernel).get(key))) ||
			(hasConsentRecord(snapshot) && counts(readStored(key))),
		document,
	};
};

export const acceptDocuments = async function acceptDocuments(
	runtime: ConsentRuntime,
	documents: V1DocumentAcceptanceItem | readonly V1DocumentAcceptanceItem[],
	options: AcceptDocumentsOptions = {}
): Promise<V1DocumentAcceptancesOutput> {
	const { client, kernel, key, property } = await bind(runtime);
	const sent = kernel.getSnapshot().subject?.subjectId;
	if (!sent) {
		throw new Error(
			'Inth documents: the runtime has no subject yet. Start it before accepting.'
		);
	}
	const generation = kernel.getRecordsGeneration();
	const answer = await client.recordAcceptances({
		acceptances: 'hash' in documents ? [documents] : documents,
		externalId: options.externalId,
		idempotencyKey: options.idempotencyKey ?? createIdempotencyKey(),
		identityProvider: options.identityProvider,
		identityToken: options.identityToken,
		property,
		subjectId: sent,
	});
	// A person's acceptance is not the device's to remember.
	if (options.externalId) {
		return answer;
	}
	let device = sent;
	// Only the move a consent save's answer makes: from the `sub_` ID sent
	// to its UUID, while that ID is still the visitor's.
	if (
		V1_LEGACY_SUBJECT_ID_PATTERN.test(sent) &&
		isUuidV7(answer.subjectId) &&
		kernel.getSnapshot().subject?.subjectId === sent
	) {
		await kernel.adoptSubject(sent, answer.subjectId);
		device = answer.subjectId;
	}
	// `identify()` links the ID now: the backend has a record of it.
	if (kernel.getProvisionalSubject() === device) {
		kernel.markProvisionalSubject(null);
	}
	if (
		answer.subjectId !== device ||
		kernel.getSnapshot().subject?.subjectId !== device ||
		kernel.getRecordsGeneration() !== generation
	) {
		return answer;
	}
	const persisted = hasConsentRecord(kernel.getSnapshot());
	const empty: Entry = { accepted: {}, subjectId: device };
	const remembered = rememberedOf(kernel);
	const fromMemory = readEntry(remembered.get(key));
	const text = writeEntry(
		fromMemory?.subjectId === device ? fromMemory : empty,
		answer.acceptances
	);
	if (text) {
		remembered.set(key, text);
	}
	if (persisted) {
		await locked(key, () => {
			const stored = readStored(key);
			const next = writeEntry(
				stored?.subjectId === device ? stored : empty,
				answer.acceptances
			);
			try {
				if (next) {
					localStorageOf()?.setItem(key, next);
				}
			} catch {
				// Remembered for this page; asked again after a reload.
			}
		});
	}
	return answer;
};
