// #region docs:expo-posthog-root title="posthog-root.tsx"
import { PostHogProvider } from 'posthog-react-native';
import type { ReactNode } from 'react';

import { posthog } from './posthog-client';

export const PostHogRoot = ({ children }: { readonly children: ReactNode }) => (
	<PostHogProvider
		client={posthog}
		autocapture={false}
	>
		{children}
	</PostHogProvider>
);
// #endregion docs:expo-posthog-root
