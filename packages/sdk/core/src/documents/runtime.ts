/**
 * `check` and `accept` of `@inth/sdk/runtime/documents`. They load on
 * their first call, through `runtime/lazy-documents.ts`.
 *
 * Documents never create, store or change the visitor's subject: consent
 * owns it. An acceptance is remembered for the subject it was recorded
 * under: for this page, and across reloads only while consent persistence
 * stores that subject. When the subject changes, the remembered acceptances
 * no longer match.
 *
 * @internal
 */
import {
	V1_DOCUMENT_HASH_PATTERN,
	V1_LEGACY_SUBJECT_ID_PATTERN,
	V1_UUID_PATTERN,
} from '@inth/sdk-schema/types';
import type {
	V1DocumentAcceptanceItem,
	V1DocumentAcceptancesOutput,
} from '@inth/sdk-schema/types';

import type { InternalKernel } from '../kernel/internals';
import { localStorageOf } from '../libs/local-storage';
import { DOCUMENT_ACCEPTANCES_STORAGE_KEY } from '../libs/storage-keys';
import { createIdempotencyKey } from '../libs/subject-uuid';
import { readStoredRecordsForReconcile } from '../modules/persistence/hydrate';
import type {
	AcceptDocumentsOptions,
	DocumentCheck,
} from '../runtime/documents';
import type { ConsentRuntime, StreamedPrefetch } from '../runtime/types';
import { trimTrailingSlash } from '../transports/v1/paths';
import { isUuidV7, resolveProperty } from '../transports/v1/routes';
import { createDocumentsClient } from './client';

/** Larger entries read as nothing. The writer stays below it. */
const MAX_ENTRY_LENGTH = 16 * 1024;
/** What one entry keeps: the latest types, and their latest hashes. */
const MAX_TYPES = 16;
const MAX_HASHES = 4;

/** One remembered acceptance of a release, with the release's document ID. */
interface Accepted {
	id: string;
	version: string;
	acceptedAt: number;
}

/** The acceptances of one subject for one project: by type, by hash. */
interface Entry {
	subjectId: string;
	accepted: Record<string, Record<string, Accepted>>;
}

type Acceptance = Accepted & { type: string; hash: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSubjectId = (value: unknown): value is string =>
	typeof value === 'string' &&
	(isUuidV7(value) || V1_LEGACY_SUBJECT_ID_PATTERN.test(value));

const isAccepted = (value: unknown): value is Accepted =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	V1_UUID_PATTERN.test(value.id) &&
	typeof value.version === 'string' &&
	typeof value.acceptedAt === 'number';

/**
 * The one reader of a stored or remembered entry. A wrong shape, a
 * malformed subject, hash or document ID, missing metadata, more than the
 * writer keeps or more than the size limit reads as nothing.
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
	acceptances: readonly Acceptance[]
): string | null {
	const accepted: Entry['accepted'] = {};
	for (const [type, hashes] of Object.entries(entry.accepted)) {
		accepted[type] = { ...hashes };
	}
	for (const { acceptedAt, hash, id, type, version } of acceptances) {
		accepted[type] = {
			...(Object.hasOwn(accepted, type) ? accepted[type] : undefined),
			[hash]: { acceptedAt, id, version },
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

/** What a runtime's page keeps: entries and checked documents. */
interface Page {
	/** Remembered acceptances, by storage key, as stored text. */
	remembered: Map<string, string>;
	/** The document ID each `check` saw, by storage key, type and hash. */
	documentIds: Map<string, string>;
	/** Every storage key the page used, for a clear to forget. */
	keys: Set<string>;
}

const pages = new WeakMap<InternalKernel, Page>();

const pageOf = function pageOf(kernel: InternalKernel): Page {
	let page = pages.get(kernel);
	if (!page) {
		page = { documentIds: new Map(), keys: new Set(), remembered: new Map() };
		pages.set(kernel, page);
	}
	return page;
};

const documentKey = (key: string, type: string, hash: string): string =>
	`${key} ${type} ${hash}`;

/**
 * Whether consent persistence stored a record for `subjectId` in this
 * browser, under whichever storage key it uses: each localStorage key and
 * cookie name is tried as one. With persistence off, or before the
 * visitor's first consent choice, nothing is stored for the subject.
 */
const storesSubject = function storesSubject(
	subjectId: string | undefined
): boolean {
	if (!subjectId) {
		return false;
	}
	const keys = new Set<string | undefined>([undefined]);
	try {
		const storage = localStorageOf();
		for (let index = 0; index < (storage?.length ?? 0); index += 1) {
			keys.add(storage?.key(index) ?? undefined);
		}
		for (const cookie of document.cookie.split(';')) {
			keys.add(cookie.split('=')[0]?.trim() || undefined);
		}
	} catch {
		// Unreadable storage keeps nothing this page can see.
	}
	const now = Date.now();
	for (const storageKey of keys) {
		try {
			if (
				readStoredRecordsForReconcile(
					storageKey === undefined ? undefined : { storageKey },
					now
				).recordedSubjectId === subjectId
			) {
				return true;
			}
		} catch {
			// Not a consent storage key.
		}
	}
	return false;
};

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
 * A clear forgets what the page remembers, and what storage keeps for the
 * cleared subject, for every project the page used.
 */
const forgetOnClear = function forgetOnClear(kernel: InternalKernel): void {
	if (forgetting.has(kernel)) {
		return;
	}
	forgetting.add(kernel);
	kernel.events.on('records:cleared', () => {
		const subjectId = kernel.getSnapshot().subject?.subjectId;
		const page = pageOf(kernel);
		page.remembered.clear();
		for (const key of page.keys) {
			void locked(key, () => {
				if (readStored(key)?.subjectId === subjectId) {
					try {
						localStorageOf()?.removeItem(key);
					} catch {
						// Without a consent record it no longer counts.
					}
				}
			});
		}
	});
};

/**
 * Wait until the runtime's subject is the one it keeps: a streamed
 * prefetch, and an init in flight or scheduled, can still replace the ID
 * it starts with. After an init that failed for good, go on with the
 * subject the runtime has.
 */
const subjectSettled = async function subjectSettled(
	runtime: ConsentRuntime
): Promise<void> {
	await (runtime as { streamed?: StreamedPrefetch }).streamed?.settled;
	const kernel = runtime.kernel as InternalKernel;
	const waiting = (): boolean =>
		runtime.started &&
		kernel.getSnapshot().policyPending &&
		kernel.initPending();
	if (!waiting()) {
		return;
	}
	await new Promise<void>((resolve) => {
		const unsubscribers: (() => void)[] = [];
		const settle = (): void => {
			if (waiting()) {
				return;
			}
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
			resolve();
		};
		unsubscribers.push(
			kernel.subscribe(settle),
			kernel.events.on('command:init:completed', settle)
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
	forgetOnClear(kernel);
	pageOf(kernel).keys.add(key);
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
	const page = pageOf(kernel);
	page.documentIds.set(documentKey(key, type, document.hash), document.id);
	const subjectId = kernel.getSnapshot().subject?.subjectId;
	const counts = (entry: Entry | null): boolean => {
		const hashes =
			entry !== null &&
			entry.subjectId === subjectId &&
			Object.hasOwn(entry.accepted, type)
				? entry.accepted[type]
				: undefined;
		return Boolean(
			hashes &&
			Object.hasOwn(hashes, document.hash) &&
			hashes[document.hash]?.id === document.id
		);
	};
	return {
		accepted:
			counts(readEntry(page.remembered.get(key))) ||
			(storesSubject(subjectId) && counts(readStored(key))),
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
	// Nothing of the answer applies to a person's acceptance, or once the
	// subject or the records changed while it was on its way.
	if (
		options.externalId ||
		kernel.getSnapshot().subject?.subjectId !== sent ||
		kernel.getRecordsGeneration() !== generation
	) {
		return answer;
	}
	// `identify()` links the ID now: the backend has a record of it.
	if (kernel.getProvisionalSubject() === sent) {
		kernel.markProvisionalSubject(null);
	}
	const page = pageOf(kernel);
	const acceptances: Acceptance[] = [];
	for (const accepted of answer.acceptances) {
		const id = page.documentIds.get(
			documentKey(key, accepted.type, accepted.hash)
		);
		if (id) {
			acceptances.push({ ...accepted, id });
		}
	}
	const empty: Entry = { accepted: {}, subjectId: sent };
	const fromPage = readEntry(page.remembered.get(key));
	const text = writeEntry(
		fromPage?.subjectId === sent ? fromPage : empty,
		acceptances
	);
	if (text) {
		page.remembered.set(key, text);
	}
	// The answer names the UUID of a `sub_` ID sent: kept for the page under
	// the ID sent, until consent moves the visitor to the UUID.
	if (answer.subjectId !== sent || !storesSubject(sent)) {
		return answer;
	}
	await locked(key, () => {
		const stored = readStored(key);
		const next = writeEntry(
			stored?.subjectId === sent ? stored : empty,
			acceptances
		);
		try {
			if (next) {
				localStorageOf()?.setItem(key, next);
			}
		} catch {
			// Remembered for this page; asked again after a reload.
		}
	});
	return answer;
};
