'use client';

import { benchPolicy } from '@inth/benchmarking/bench-policy';
import { ConsentDraftProvider } from '@inth/react/draft';
import { useSaveConsents } from '@inth/react/hooks';
import { useScriptLoader } from '@inth/react/module-hooks/script-loader';
import { InthProvider } from '@inth/react/provider';
import { useEffect, useMemo, useState } from 'react';

import { createInitialBenchState, listDomIds, makeScripts } from './fixtures';
import type { ScriptCountBenchState } from './fixtures';

const publish = function publish(
	state: ScriptCountBenchState,
	patch: Partial<Omit<ScriptCountBenchState, 'recordScriptExecution'>>
) {
	Object.assign(state, patch);
	window.__inthScriptCountBench = state;
	(
		window as unknown as { __inthScriptBench?: ScriptCountBenchState }
	).__inthScriptBench = state;
};

const ScriptCountProbe = ({ count }: { count: number }) => {
	const scripts = useMemo(() => makeScripts(count), [count]);
	const loader = useScriptLoader(scripts);
	const saveConsents = useSaveConsents();
	const [bench, setBench] = useState(() => createInitialBenchState(count));
	void setBench;

	useEffect(() => {
		window.__inthScriptCountBench = bench;
		publish(bench, {
			activeUI: 'ready',
			initialReady: true,
		});

		window.__inthGetScriptCountBenchState = () => {
			publish(bench, {
				domIds: listDomIds(count),
				loadedIds: loader
					.getLoadedScriptIds()
					.sort((left, right) => left.localeCompare(right)),
			});
			return bench;
		};

		return () => {
			if (window.__inthGetScriptCountBenchState) {
				delete window.__inthGetScriptCountBenchState;
			}
		};
	}, [bench, loader, count]);

	return (
		<>
			<button
				id="run-script-count"
				onClick={() => {
					publish(bench, {
						actionStartedAtMs: performance.now(),
						complete: false,
						completedAtMs: null,
					});
					void saveConsents('all');
				}}
				type="button"
			>
				Accept all
			</button>
			<pre id="script-count-state">ready</pre>
		</>
	);
};

export const ScriptCountBenchmark = ({ count }: { count: number }) => (
	<InthProvider
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
			persistence: false,
		}}
	>
		<ConsentDraftProvider>
			<main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
				<h1>@inth/react script count benchmark</h1>
				<p>Scripts: {count}</p>
				<ScriptCountProbe count={count} />
			</main>
		</ConsentDraftProvider>
	</InthProvider>
);
