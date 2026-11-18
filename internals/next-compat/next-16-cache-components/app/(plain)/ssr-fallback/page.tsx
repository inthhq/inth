import { ConsentShell } from '@c15t/next-compat-shared/consent-shell';
import { resolveConsent } from '@inth/nextjs/server';
import { Suspense } from 'react';

const ResolvedConsent = async () => {
	const errors: unknown[] = [];
	const state = await resolveConsent({
		// Both the manifest and the `/init` fallback fail, so the render keeps
		// the request-only state and reports the failure once.
		manifestUrl: '/api/consent/unavailable/manifest',
		onError(error) {
			errors.push(error);
		},
		projectUrl: '/api/consent/unavailable',
		timeoutMs: false,
	});

	return (
		<ConsentShell
			styles={false}
			state={state}
			scenario="ssr-fallback"
		>
			<p>{`Fallback consent: ${state.initialOverrides?.country}, manifest failed: ${errors.length === 1}`}</p>
		</ConsentShell>
	);
};

const SSRFallbackPage = () => (
	<Suspense fallback={null}>
		<ResolvedConsent />
	</Suspense>
);

export default SSRFallbackPage;
