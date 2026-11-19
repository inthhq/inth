'use client';

import { benchPolicy } from '@inth/benchmarking/bench-policy';
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
const ReactFullSplitPage = () => (
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
		}}
	>
		<ConsentDraftProvider>
			<main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
				<h1>React Full Split Benchmark</h1>
				<p>This route imports the UI experience from split subpaths.</p>
				<TestComponent />
			</main>
			<ConsentBanner />
			<ConsentDialog />
			<ConsentWidget />
		</ConsentDraftProvider>
	</ConsentProvider>
);

export default ReactFullSplitPage;
