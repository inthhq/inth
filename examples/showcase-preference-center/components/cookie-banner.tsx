'use client';

import { ConsentBanner } from '@inth/nextjs';
import { usePathname } from 'next/navigation';

export const PRIVACY_SETTINGS_PATH = '/account/privacy';

/**
 * The stock banner. Customize opens the options in place; the account
 * privacy page asks the same question in full, so the banner steps aside
 * there.
 */
export const CookieBanner = () => {
	const pathname = usePathname();

	// The banner comes back on other pages until the visitor chooses.
	if (pathname === PRIVACY_SETTINGS_PATH) {
		return null;
	}

	return <ConsentBanner />;
};
