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
import type { ConsentRuntime } from '../runtime/types';
import { resolveProperty } from '../transports/v1/routes';
import { createDocumentsClient } from './client';

type StoredAcceptance = Pick<
	V1DocumentAcceptancesOutput['acceptances'][number],
	'acceptedAt' | 'hash' | 'version'
>;

/** What the runtime's transport factory carries about its backend. */
interface Backend {
	projectUrl?: string;
	property?: string;
	fetch?: typeof globalThis.fetch;
}

const backendOf = function backendOf(runtime: ConsentRuntime) {
	const { fetch, projectUrl, property } = (runtime.mode ?? {}) as Backend;
	if (!projectUrl) {
		throw new Error(
			'Inth documents: this runtime has no backend. Set `projectUrl` on the provider.'
		);
	}
	return {
		client: createDocumentsClient({ fetch, projectUrl }),
		property: resolveProperty(projectUrl, property),
	};
};

const readStored = function readStored(): Record<string, StoredAcceptance> {
	try {
		const value: unknown = JSON.parse(
			localStorageOf()?.getItem(DOCUMENT_ACCEPTANCES_STORAGE_KEY) ?? '{}'
		);
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, StoredAcceptance>)
			: {};
	} catch {
		return {};
	}
};

const store = function store(
	acceptances: V1DocumentAcceptancesOutput['acceptances']
): void {
	const stored = readStored();
	for (const { acceptedAt, hash, type, version } of acceptances) {
		stored[type] = { acceptedAt, hash, version };
	}
	try {
		localStorageOf()?.setItem(
			DOCUMENT_ACCEPTANCES_STORAGE_KEY,
			JSON.stringify(stored)
		);
	} catch {
		// The backend recorded it; this browser asks again next time.
	}
};

export const checkDocument = async function checkDocument(
	runtime: ConsentRuntime,
	type: string
): Promise<DocumentCheck> {
	const { document } = await backendOf(runtime).client.getCurrent(type);
	const stored = readStored();
	const hash = Object.hasOwn(stored, type) ? stored[type]?.hash : undefined;
	return {
		accepted:
			typeof hash === 'string' &&
			(hash === document.hash || !document.requiresAcceptance),
		document,
	};
};

export const acceptDocuments = async function acceptDocuments(
	runtime: ConsentRuntime,
	documents: V1DocumentAcceptanceItem | readonly V1DocumentAcceptanceItem[],
	options: AcceptDocumentsOptions = {}
): Promise<V1DocumentAcceptancesOutput> {
	const { client, property } = backendOf(runtime);
	const kernel = runtime.kernel as InternalKernel;
	let subjectId = kernel.getSnapshot().subject?.subjectId;
	if (!subjectId) {
		subjectId = generateUuidV7();
		kernel.set.subjectId(subjectId);
	}
	const answer = await client.recordAcceptances({
		acceptances: 'hash' in documents ? [documents] : documents,
		externalId: options.externalId,
		idempotencyKey: options.idempotencyKey ?? createIdempotencyKey(),
		identityProvider: options.identityProvider,
		identityToken: options.identityToken,
		property,
		subjectId,
	});
	if (answer.subjectId !== subjectId) {
		await kernel.adoptSubject(subjectId, answer.subjectId);
	}
	store(answer.acceptances);
	return answer;
};
