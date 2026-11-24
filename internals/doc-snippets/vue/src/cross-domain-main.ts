// #region docs:cross-domain-main title="main.ts"
import { inth } from '@inth/vue';

// #hide docs
import {
	app,
	identityToken,
	user,
	userConsent,
} from './cross-domain-stand-ins';
// #endhide docs

app.use(inth, {
	projectUrl: import.meta.env.VITE_INTH_PROJECT_URL,
	user: { externalId: user.id, identityToken },
	userConsent,
});
// #endregion docs:cross-domain-main
