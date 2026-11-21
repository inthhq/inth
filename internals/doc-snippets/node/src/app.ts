import type { InthDocument, InthDocumentType } from '@inth/node';

/** Stand-ins for the app's own code, so the sign-up snippets type-check */

/** A release the visitor was shown: its type and the hash that names it */
export interface ShownDocument {
	readonly type: InthDocumentType;
	readonly hash: string;
}

export interface SignUpForm {
	readonly email: string;
	/** The visitor ticked the box that accepts the terms and privacy policy */
	readonly accepted: boolean;
}

export const saveShownDocuments = (
	_request: Request,
	_documents: readonly ShownDocument[]
): Promise<void> => Promise.resolve();

export const readShownDocuments = (
	_request: Request
): Promise<readonly ShownDocument[] | undefined> => Promise.resolve(undefined);

export const renderSignUpForm = (_documents: {
	readonly terms: InthDocument;
	readonly privacy: InthDocument;
}): Response => new Response('');

export const createUser = (
	_form: SignUpForm
): Promise<{ readonly id: string }> => Promise.resolve({ id: 'user_1' });

export const clientIp = (_request: Request): string | undefined => undefined;

export const saveForRetry = (_acceptance: unknown): Promise<void> =>
	Promise.resolve();
