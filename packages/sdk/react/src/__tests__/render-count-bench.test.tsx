/**
 * When marketing flips, only the children reading `marketing` may
 * re-render. The other 8 stay quiet.
 */
import { Profiler } from 'react';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentProvider, useConsent, useSaveConsents } from '../index';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

type Category =
	| 'necessary'
	| 'functionality'
	| 'marketing'
	| 'measurement'
	| 'experience';
const CATEGORIES: Category[] = [
	'necessary',
	'functionality',
	'marketing',
	'measurement',
	'experience',
];
const CHILDREN = 10;

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 20);
	});

interface Run {
	mountRenders: number;
	mutationRenders: number;
}

const runBench = async function runBench(): Promise<Run> {
	const counts = new Map<number, number>();

	const Child = ({ index }: { index: number }) => {
		const category = CATEGORIES[index % CATEGORIES.length] as Category;
		const allowed = useConsent(category);
		return (
			<Profiler
				id={`child-${index}`}
				onRender={() => {
					counts.set(index, (counts.get(index) ?? 0) + 1);
				}}
			>
				<div data-testid={`child-${index}`}>
					{category}:{String(allowed)}
				</div>
			</Profiler>
		);
	};

	const Mutator = () => {
		const setConsent = useSaveConsents();
		return (
			<button
				data-testid="toggle"
				onClick={() => setConsent({ marketing: true })}
				type="button"
			>
				flip marketing
			</button>
		);
	};

	const { getByTestId } = await render(
		<ConsentProvider
			options={{
				mode: testing(),
				persistence: false,
				prefetch: policyFixture(),
			}}
		>
			{Array.from({ length: CHILDREN }, (_, i) => (
				<Child
					key={i}
					index={i}
				/>
			))}
			<Mutator />
		</ConsentProvider>
	);

	await settle();
	const mountRenders = Array.from(counts.values()).reduce((a, b) => a + b, 0);

	await getByTestId('toggle').click();
	await settle();

	const afterMutation = Array.from(counts.values()).reduce((a, b) => a + b, 0);
	const mutationRenders = afterMutation - mountRenders;

	return { mountRenders, mutationRenders };
};

describe('render-count bench', () => {
	test('only the children reading the mutated slice re-render', async () => {
		const run = await runBench();

		const payload = {
			children: CHILDREN,
			generatedAt: new Date().toISOString(),
			run,
			suite: 'react-render-counts',
		};

		// Stash on window so a test-runner reporter (or adjacent node
		// harness) can pull it out. Can't write node:fs from the browser
		// bundle.
		(globalThis as Record<string, unknown>).__INTH_RENDER_BENCH__ = payload;

		console.log(
			`\n[render-count-bench] mount=${run.mountRenders} mutation=${run.mutationRenders}\n`
		);

		// Expected marketing readers: index % 5 === 2, so 2 of 10 children.
		const expectedMarketingReaders = Array.from(
			{ length: CHILDREN },
			(_, i) => i
		).filter((i) => CATEGORIES[i % CATEGORIES.length] === 'marketing').length;

		expect(run.mutationRenders).toBeLessThanOrEqual(expectedMarketingReaders);
	});
});
