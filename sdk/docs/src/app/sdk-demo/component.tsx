"use client";

import { Button } from "@/components/ui/button";
import { useConsentManager } from "@koroflow/elements/common";
import "@koroflow/elements/globals.css";
import { Cookie, RefreshCw } from "lucide-react";
import { useCallback } from "react";

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
				<Button onClick={handleResetConsent} variant="ghost">
					<RefreshCw className="h-4 w-4 mr-2" />
					Reset Local Storage Consent
				</Button>
			</div>
		</div>
	);
}
