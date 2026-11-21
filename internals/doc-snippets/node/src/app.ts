import type { InthDocument, InthDocumentType } from '@inth/node';

/** Stand-ins for the app's own code, so the sign-up snippets type-check */

/** A release the visitor was shown: its type and the hash that names it */
export interface ShownDocument {
	readonly type: InthDocumentType;
	readonly hash: string;
}

export interface SignUpForm {
	/** The ID the server gave this form when it showed it */
	readonly formId: string;
	readonly email: string;
	/** The visitor ticked the box that accepts the terms and privacy policy */
	readonly accepted: boolean;
}

/** Keeps what one form showed in the visitor's session, under a new random ID */
export const saveShownDocuments = (
	_request: Request,
	_documents: readonly ShownDocument[]
): Promise<string> => Promise.resolve(crypto.randomUUID());

/** What the form with this ID showed, from the same visitor's session */
export const readShownDocuments = (
	_request: Request,
	_formId: string
): Promise<readonly ShownDocument[] | undefined> => Promise.resolve(undefined);

export const renderSignUpForm = (_form: {
	readonly formId: string;
	readonly terms: InthDocument;
	readonly privacy: InthDocument;
}): Response => new Response('');

export const createUser = (
	_form: SignUpForm
): Promise<{ readonly id: string }> => Promise.resolve({ id: 'user_1' });

export const clientIp = (_request: Request): string | undefined => undefined;

export const saveForRetry = (_acceptance: unknown): Promise<void> =>
	Promise.resolve();
