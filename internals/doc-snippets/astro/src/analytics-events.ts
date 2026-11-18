// #region docs:analytics-events
import { getEventDispatcher } from '@inth/astro/client';

// One dispatcher for the page. It sends to the scripts in inth.client.ts
// and checks consent each time an event goes out.
const events = getEventDispatcher();

export const trackSearch = function trackSearch(resultCount: number) {
	events.track('search', { resultCount });
};
// #endregion docs:analytics-events
