/**
 * `@inth/sdk/runtime/documents` — legal documents for the visitor a
 * consent runtime holds: whether they accepted the release in force, and
 * recording that they did.
 *
 * Both go to the backend the runtime saves consent to, for the runtime's
 * subject and property. The code behind them loads on the first call, so a
 * page that never calls them does not download it.
 *
 * A browser acceptance belongs to the device. A server that knows the
 * person should record the acceptance with the project's secret key instead.
 *
 * @example
 * ```ts
 * import { createRuntimeDocuments } from '@inth/sdk/runtime/documents';
 *
 * const documents = createRuntimeDocuments(() => runtime);
 * const terms = await documents.check('terms_us');
 * if (!terms.accepted) {
 *   // Show terms.document, then on submit:
 *   await documents.accept({ type: 'terms_us', hash: terms.document.hash });
 * }
 * ```
 */
import type {
	V1DocumentAcceptanceItem,
	V1DocumentAcceptancesOutput,
	V1DocumentCurrentOutput,
} from '@inth/sdk-schema/types';

import type * as LazyDocuments from './lazy-documents';
import type { ConsentRuntime } from './types';

/** What {@link RuntimeDocuments.check} resolves with. */
export interface DocumentCheck {
	/** The release in force. Its `hash` names it in `accept`. */
	document: V1DocumentCurrentOutput['document'];
	/**
	 * Whether this browser accepted it: it stored an acceptance of the same
	 * hash, or of an earlier release while this one has
	 * `requiresAcceptance: false`.
	 */
	accepted: boolean;
}

/** What {@link RuntimeDocuments.accept} takes besides the documents. */
export interface AcceptDocumentsOptions {
	/**
	 * Key of this user action, from `createIdempotencyKey()`. Pass the key
	 * of a failed call to retry it. Defaults to a new key.
	 */
	idempotencyKey?: string;
	/** The person, with `identityToken`. Recorded for the person too. */
	externalId?: string;
	identityProvider?: string;
	/** Signed proof of `externalId`, minted by your server. */
	identityToken?: string;
}

/** Legal documents for the visitor a runtime holds. */
export interface RuntimeDocuments {
	/**
	 * Read the release of `type` in force and whether this browser accepted
	 * it. Rejects with an `InthApiError` with code `not_found` when the type
	 * has no current release.
	 */
	check: (type: string) => Promise<DocumentCheck>;
	/**
	 * Record that the visitor accepted one or more releases, by the `type`
	 * and `hash` that `check` gave, and remember it in this browser. Uses
	 * the runtime's subject ID, and makes one when there is none. Rejects
	 * with an `InthApiError` when nothing was recorded; nothing is retried.
	 */
	accept: (
		documents: V1DocumentAcceptanceItem | readonly V1DocumentAcceptanceItem[],
		options?: AcceptDocumentsOptions
	) => Promise<V1DocumentAcceptancesOutput>;
}

let loading: Promise<typeof LazyDocuments> | undefined;

const load = async function load(): Promise<typeof LazyDocuments> {
	loading ??= import('./lazy-documents');
	try {
		return await loading;
	} catch (error) {
		loading = undefined;
		throw error;
	}
};

/**
 * Bind legal documents to a runtime.
 *
 * @param getRuntime - Returns the runtime on each call, or a promise of it
 * for a host whose runtime attaches later.
 * @returns `check` and `accept`.
 */
export const createRuntimeDocuments = function createRuntimeDocuments(
	getRuntime: () => ConsentRuntime | PromiseLike<ConsentRuntime>
): RuntimeDocuments {
	return {
		async accept(documents, options) {
			const [module, runtime] = await Promise.all([load(), getRuntime()]);
			return module.acceptDocuments(runtime, documents, options);
		},
		async check(type) {
			const [module, runtime] = await Promise.all([load(), getRuntime()]);
			return module.checkDocument(runtime, type);
		},
	};
};
