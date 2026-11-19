// #region docs:shopify-layout
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import { resolveConsent } from '@inth/nextjs/server';
import { connection } from 'next/server';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { PageViewTracker } from '@/components/page-view-tracker';
import {
	ShopifyAnalytics,
	ShopifyConsentSync,
} from '@/components/shopify-analytics';
import { SiteHeader } from '@/components/site-header';
import { StoreProviders } from '@/components/store-providers';
import { currency, i18n, shop } from '@/lib/shop';
import { getCart } from '@/lib/storefront';

import './globals.css';

const RootLayout = async ({ children }: { children: ReactNode }) => {
	// The cart comes from the visitor's cookie, so every page renders per request.
	await connection();

	return (
		<html lang="en">
			<head>
				{/* Hydrogen's scripts belong in the head, once per page. */}
				<ShopifyAnalytics
					i18n={{ ...i18n, currency }}
					shop={shop}
				/>
			</head>
			<body>
				<InthProvider state={resolveConsent()}>
					<ShopifyConsentSync />
					<StoreProviders cart={getCart()}>
						<SiteHeader />
						<Suspense fallback={null}>
							<PageViewTracker />
						</Suspense>
						{children}
					</StoreProviders>
					<ConsentBanner />
					<ConsentDialog />
					<footer className="site-footer">
						<ConsentDialogLink>Privacy settings</ConsentDialogLink>
					</footer>
				</InthProvider>
			</body>
		</html>
	);
};

export default RootLayout;
// #endregion docs:shopify-layout
