'use client';

import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import { ConsentBanner } from '@inth/react/consent-banner';
import { ConsentDialog } from '@inth/react/consent-dialog';
import { ConsentWidget } from '@inth/react/consent-widget';
import { ConsentDraftProvider, useConsentDraft } from '@inth/react/draft';
import {
	useEffectivePermissions,
	useExplicitChoice,
	useSaveConsents,
} from '@inth/react/hooks';
import { ConsentProvider } from '@inth/react/provider';
import type { AllConsentNames } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/modules/script-loader';

const DEMO_SCRIPTS: Script[] = [
	{
		async: true,
		category: 'measurement',
		id: 'gtm',
		src: 'https://www.googletagmanager.com/gtm.js?id=GTM-DEMO',
	},
	{
		async: true,
		category: 'measurement',
		id: 'ga',
		src: 'https://www.google-analytics.com/analytics.js',
	},
	{
		async: true,
		category: 'marketing',
		id: 'fb-pixel',
		src: 'https://connect.facebook.net/en_US/fbevents.js',
	},
	{
		async: true,
		category: 'functionality',
		id: 'intercom',
		src: 'https://widget.intercom.io/widget.js',
	},
];

const CATEGORIES: AllConsentNames[] = [
	'necessary',
	'functionality',
	'marketing',
	'measurement',
	'experience',
];

const TestComponent = () => {
	const consents = useEffectivePermissions();
	const draft = useConsentDraft();
	const saveConsents = useSaveConsents();
	const hasStoredChoice = Boolean(useExplicitChoice());

	return (
		<div>
			<p>Has stored choice: {String(hasStoredChoice)}</p>
			<div>
				{CATEGORIES.map((category) => (
					<label
						key={category}
						style={{ display: 'block' }}
					>
						<input
							checked={draft.values[category]}
							disabled={category === 'necessary'}
							onChange={(event) => draft.set(category, event.target.checked)}
							type="checkbox"
						/>
						{category}
					</label>
				))}
			</div>
			<pre>{JSON.stringify(consents, null, 2)}</pre>
			<button
				onClick={() => saveConsents('all')}
				type="button"
			>
				Accept All
			</button>
		</div>
	);
};
const ReactStandardScriptLoaderPage = () => (
	<ConsentProvider
		options={{
			mode: benchPolicy({
				policy: [
					{
						id: 'bench-opt-in',
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
					},
				],
			}),
			scripts: DEMO_SCRIPTS,
		}}
	>
		<ConsentDraftProvider>
			<main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
				<h1>React Standard + Script Loader Benchmark</h1>
				<p>
					This route measures the standard UI, persistence, and script-loader
					runtime, without network or iframe blockers.
				</p>
				<TestComponent />
			</main>
			<ConsentBanner />
			<ConsentDialog />
			<ConsentWidget />
		</ConsentDraftProvider>
	</ConsentProvider>
);

export default ReactStandardScriptLoaderPage;
