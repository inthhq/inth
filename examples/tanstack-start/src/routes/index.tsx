import { useConsent } from '@inth/tanstack-start';
import { createFileRoute } from '@tanstack/react-router';

const HomePage = () => {
	const measurement = useConsent('measurement');
	return (
		<main>
			<h1>Inth with TanStack Start</h1>
			<p>
				PostHog{' '}
				{measurement ? 'is allowed to load' : 'waits for measurement consent'}.
			</p>
		</main>
	);
};

export const Route = createFileRoute('/')({ component: HomePage });
