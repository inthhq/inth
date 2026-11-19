// #region docs:analytics-events title="src/components/pageviews.tsx"
import { useEventDispatcher } from '@inth/tanstack-start';
import { useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';

/** Render once inside `InthProvider`, such as in the root route. */
export const Pageviews = () => {
	const events = useEventDispatcher({ pageviews: ['posthog'] });
	// The path with its query string, so search and filter changes count.
	const href = useLocation({ select: (location) => location.href });
	useEffect(() => {
		events.pageview(href);
	}, [events, href]);
	return null;
};
// #endregion docs:analytics-events
