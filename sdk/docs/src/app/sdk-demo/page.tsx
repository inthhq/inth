"use client";

import { Button } from "@/components/ui/button";
import KoroflowDevTool from "@koroflow/dev-tools";
import { ConsentManagerProvider, useConsentManager } from "@koroflow/elements/common";
import { ConsentManagerDialog } from "@koroflow/elements/consent-manager";
import CookieBanner from "@koroflow/elements/cookie-banner";
import "@koroflow/elements/globals.css";
import { Cookie, RefreshCw } from "lucide-react";
import { useCallback } from "react";

export default function PrivacyConsentPage() {
	return (
		<main className="container py-10">
			<ConsentManagerProvider
				initialGdprTypes={["necessary", "marketing", "functionality", "measurement"]}
				initialComplianceSettings={{
					gdpr: { enabled: true, appliesGlobally: true, applies: true },
					ccpa: { enabled: true, appliesGlobally: false, applies: undefined },
					lgpd: { enabled: false, appliesGlobally: false, applies: undefined },
					usStatePrivacy: {
						enabled: true,
						appliesGlobally: false,
						applies: undefined,
					},
				}}
			>
				<DemoWidget />
				<CookieBanner />
				<ConsentManagerDialog />
				<KoroflowDevTool />
			</ConsentManagerProvider>
		</main>
	);
}

export function DemoWidget() {
	const { clearAllData, setShowPopup, setIsPrivacyDialogOpen } = useConsentManager();
	const handleResetConsent = useCallback(() => {
		clearAllData();
	}, [clearAllData]);

	const handleOpenCookiePopup = useCallback(() => {
		setShowPopup(true);
	}, [setShowPopup]);

	const handleOpenConsentCustomization = useCallback(() => {
		setIsPrivacyDialogOpen(true);
	}, [setIsPrivacyDialogOpen]);

	return (
		<div className="space-y-8">
			<div className="text-center space-y-4 mb-8">
				<h1 className="text-4xl font-bold">Koroflow SDK Demo</h1>
				<p className="text-xl">Explore our privacy consent management tools</p>
			</div>

			<div className="flex flex-row gap-4 py-8 lg:py-0 items-center justify-center max-w-xl mx-auto">
				<Button onClick={handleOpenCookiePopup}>
					<Cookie className="h-4 w-4 mr-2" />
					Open Cookie Banner
				</Button>
				<Button onClick={handleOpenConsentCustomization}>
					<Cookie className="h-4 w-4 mr-2" />
					Open Consent Dialog
				</Button>
			</div>
			<div className="flex flex-row gap-4 py-8 lg:py-0 items-center justify-center max-w-xl mx-auto">
				<Button onClick={handleResetConsent}>
					<RefreshCw className="h-4 w-4 mr-2" />
					Reset Local Storage Consent
				</Button>
			</div>
		</div>
	);
}
