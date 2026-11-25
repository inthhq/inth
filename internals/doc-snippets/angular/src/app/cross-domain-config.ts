// #region docs:cross-domain-config title="app.config.ts"
import { provideInth } from '@inth/angular';

// #hide docs
import { identityToken, user, userConsent } from './cross-domain-stand-ins';
// #endhide docs

export const appConfig = {
	providers: [
		provideInth({
			projectUrl: 'https://your-project.inth.app',
			user: { externalId: user.id, identityToken },
			userConsent,
		}),
	],
};
// #endregion docs:cross-domain-config
