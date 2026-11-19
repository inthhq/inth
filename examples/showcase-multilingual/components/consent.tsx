'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentRoot,
	useSetLanguage,
} from '@inth/nextjs';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { messages } from '@/lib/consent-i18n';
import { brandTheme } from '@/lib/consent-theme';
import type { Locale } from '@/lib/locales';

// The backend is your Inth project: set NEXT_PUBLIC_INTH_PROJECT_URL in
// .env.local. The policy comes from its consent manifest.
const config = {
	projectUrl:
		process.env.NEXT_PUBLIC_INTH_PROJECT_URL ?? 'https://your-project.inth.app',
};

/**
 * Keeps Inth's language on the route's locale. `ConsentRoot` reads `i18n`
 * once, so a client-side move from /en to /de goes through
 * `useSetLanguage`, which switches the copy and resolves the policy again.
 */
const FollowLocale = ({ locale }: { locale: Locale }) => {
	const setLanguage = useSetLanguage();
	useEffect(() => {
		setLanguage(locale);
	}, [locale, setLanguage]);
	return null;
};

export const Consent = ({
	children,
	locale,
}: {
	children: ReactNode;
	locale: Locale;
}) => (
	<ConsentRoot
		config={config}
		state={{}}
		options={{
			consentCategories: ['necessary', 'measurement', 'marketing'],
			i18n: { locale, messages },
			overrides: { language: locale },
			theme: brandTheme,
		}}
	>
		<FollowLocale locale={locale} />
		{children}
		<ConsentBanner />
		<ConsentDialog />
	</ConsentRoot>
);
