/**
 * `client.documents` in the script-tag files. A script tag has no chunk to
 * load the documents code from, and inlining it would add it to every
 * page, so `check` and `accept` reject there.
 */
import type { RuntimeDocuments } from '@inth/sdk-core/runtime/documents';

const unavailable = (): Promise<never> =>
	Promise.reject(
		new Error(
			'@inth/sdk: legal documents are not in the script-tag files. Install @inth/sdk from npm, or record acceptances from your server.'
		)
	);

export const createRuntimeDocuments = (): RuntimeDocuments => ({
	accept: unavailable,
	check: unavailable,
});
