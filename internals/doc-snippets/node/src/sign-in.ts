// #region docs:node-sign-in title="sign-in.ts"
import { Inth } from '@inth/node';
import { readRequestConsent } from '@inth/sdk/server';

// Reads INTH_SECRET_KEY and INTH_PROJECT_URL
const inth = new Inth();

export const onSignIn = async (request: Request, user: { id: string }) => {
	const { state } = readRequestConsent({
		adapter: '@inth/nextjs',
		request: { headers: request.headers },
		// The banner's storageConfig, when it sets its own storageKey: the
		// cookie is read by that name
		storage: { storageKey: 'inth' },
	});
	const subjectId = state.initialRecords?.subject?.subjectId;
	if (!subjectId) {
		// The visitor has not saved a choice yet, so there is nothing to link
		return;
	}
	const { error } = await inth.users.identify({
		externalId: user.id,
		subjectId,
	});
	if (error) {
		// Sign-in can go on. This browser counts once a later sign-in links it
		console.error(error);
	}
};
// #endregion docs:node-sign-in
