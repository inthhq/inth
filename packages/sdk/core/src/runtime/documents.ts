/**
 * `@inth/sdk/runtime/documents` — legal documents for the visitor a
 * consent runtime holds: whether they accepted the release in force, and
 * recording that they did.
 *
 * Both go to the backend the runtime saves consent to, for the runtime's
 * subject and property. The code behind them loads on the first call, so a
 * page that never calls them does not download it.
 *
 * Without a verified identity an acceptance is recorded for the device. A
 * server that knows the person should record it with the project's secret
 * key instead.
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

export { createIdempotencyKey } from '../libs/subject-uuid';
export { isInthApiError } from '../transports/v1/error';

/** What {@link RuntimeDocuments.check} resolves with. */
export interface DocumentCheck {
	/** The release in force. Its `hash` names it in `accept`. */
	document: V1DocumentCurrentOutput['document'];
	/**
	 * Whether this browser recorded an acceptance of this release, by its
	 * hash, for the runtime's backend and current subject. An earlier release accepted
	 * does not count: the browser cannot see the releases in between. Not
	 * asking again when `document.requiresAcceptance` is `false` is the
	 * app's call.
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
	/**
	 * The person, with `identityToken`. The acceptance is recorded for the
	 * person, and this browser remembers nothing for the device.
	 */
	externalId?: string;
	identityProvider?: string;
	/** Signed proof of `externalId`, minted by your server. */
	identityToken?: string;
}

/** Legal documents for the visitor a runtime holds. */
export interface RuntimeDocuments {
	/**
	 * Read the release of `type` in force and whether this browser accepted
	 * it. Rejects with an API error whose `code` is `not_found` when the
	 * type has no current release: test it with `isInthApiError`.
	 */
	check: (type: string) => Promise<DocumentCheck>;
	/**
	 * Record that the visitor accepted one or more releases, by the `type`
	 * and `hash` that `check` gave, under the runtime's subject ID once it
	 * has settled, and remember it in this browser for that subject. Rejects
	 * when the runtime has no subject yet, and with an API error
	 * (`isInthApiError`) when nothing was recorded; nothing is sent again.
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
		// The next call imports again, but a browser can answer with the
		// same failure until the page reloads.
		throw new Error(
			'Inth documents: their code failed to load. Reload the page to try again.',
			{ cause: error }
		);
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
