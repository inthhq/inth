// #region docs:pages-app title="pages/_app.tsx"
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { ConsentPageProps } from '@inth/nextjs/pages';
import type { AppProps } from 'next/app';

import '@/styles/globals.css';

const App = ({ Component, pageProps }: AppProps<ConsentPageProps>) => (
	// Pages without getServerSideProps resolve consent in the browser.
	<InthProvider state={pageProps.consent}>
		<Component {...pageProps} />
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);

export default App;
// #endregion docs:pages-app
