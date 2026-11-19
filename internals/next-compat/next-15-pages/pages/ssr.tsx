import { COMPAT_HOSTED_CONFIG } from '@inth/next-compat-shared/config';
import { ConsentShell } from '@inth/next-compat-shared/consent-shell';
import type { ConsentPageProps } from '@inth/nextjs/pages';
import { withConsentProps } from '@inth/nextjs/pages';

/**
 * Pages Router SSR. `withConsentProps` reads the request from the
 * `getServerSideProps` `req` instead of `next/headers` and adds the
 * JSON-safe `consent` prop.
 */
export const getServerSideProps = withConsentProps(undefined, {
	config: COMPAT_HOSTED_CONFIG,
});

const SSRPage = ({ consent }: ConsentPageProps) => (
	<ConsentShell
		styles={false}
		state={consent}
		scenario="ssr"
	>
		<p>resolveConsent inside getServerSideProps.</p>
	</ConsentShell>
);

export default SSRPage;
