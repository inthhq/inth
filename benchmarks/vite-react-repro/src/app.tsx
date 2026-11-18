import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogTrigger,
	ConsentProvider,
} from '@inth/react';

export const App = () => (
	<ConsentProvider
		options={{
			disableAnimation: true,
			mode: benchPolicy({
				policy: [
					{
						id: 'repro-opt-in',
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
					},
				],
			}),
		}}
	>
		<main className="app-shell">
			<div className="copy">
				<p className="eyebrow">Vite Repro</p>
				<h1>@inth/react bundle inspection</h1>
				<p>
					This app intentionally imports the root `@inth/react` entrypoint so
					the production bundle can be inspected with the Rollup visualizer.
				</p>
			</div>
			<ConsentBanner />
			<ConsentDialog />
			<ConsentDialogTrigger />
		</main>
	</ConsentProvider>
);
