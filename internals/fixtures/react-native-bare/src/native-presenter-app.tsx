import {
	closeConsentPresenter,
	onConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
	useConsentStatus,
} from '@inth/react-native';
import type {
	ConsentPresenterOutcome,
	ConsentPresenterSession,
} from '@inth/react-native';
import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';

import { useDemoDeepLinks } from './deep-links/use-deep-links';
import { useDemoActions } from './deep-links/use-demo-actions';
import { useE2eObserver } from './e2e-observer';
import { useE2eVendorProbe } from './vendors/e2e-vendor-probe';

const privacyPolicyURL = 'https://c15t.com/privacy';
const outcomes: ConsentPresenterOutcome[] = [];
const presentations: ConsentPresenterSession[] = [];
const endpoint = process.env.C15T_E2E_URL || 'http://localhost:3000';
const vendorProbeSettings = {
	enabled: process.env.C15T_APP_E2E === '1',
	endpoint,
	// Android sets the emulator's host alias; Mixpanel refuses loopback hosts there.
	mixpanelEndpoint: process.env.C15T_E2E_MIXPANEL_URL || endpoint,
};

if (process.env.C15T_APP_E2E === '1') {
	// Activity recreation remounts the React root. Observe the whole JS runtime.
	onConsentPresenterOutcome((outcome) => outcomes.push(outcome));
}

const requestPresentation = async (
	preferences: boolean,
	onError: (message: string) => void
) => {
	try {
		const presentation = await (preferences
			? presentPreferences(privacyPolicyURL)
			: presentConsentPrompt(privacyPolicyURL));
		presentations.push(presentation);
		if (process.env.C15T_APP_E2E === '1') {
			await fetch(`${endpoint}/e2e/js-block`, {
				body: JSON.stringify({ presentations }),
				method: 'POST',
			});
		}
	} catch (failure: unknown) {
		onError(String(failure));
	}
};

/** Reference host. All consent controls, drafts and navigation belong to native UI. */
export const NativePresenterApp = () => {
	useE2eObserver();
	const vendors = useE2eVendorProbe(vendorProbeSettings);
	const handleVendorProbe = vendors.probe;
	const status = useConsentStatus();
	const actions = useDemoActions();
	const [latest, setLatest] = useState<ConsentPresenterOutcome>();
	const [error, setError] = useState('');
	const [hostActions, setHostActions] = useState(0);
	const open = () => {
		void requestPresentation(true, setError);
	};
	useDemoDeepLinks({
		actions,
		closeSheets: () => {
			// Native presenters own this operation.
		},
		openDialog: open,
		openIabDrawer: open,
		openPreferences: open,
		promptOwed: status.promptRequirement.kind !== 'none',
		requestTracking: () =>
			Promise.reject(new Error('Use the explicit tracking API')),
		setAppearance: () => {
			// Native presenters own this operation.
		},
		showDiagnostics: () => {
			// Native presenters own this operation.
		},
	});
	useEffect(
		() =>
			onConsentPresenterOutcome((outcome) => {
				setLatest(outcome);
			}),
		[]
	);
	useEffect(() => {
		// E2E sends the startup vendor probe first: the prompt's Android Activity
		// pauses JavaScript timers, and the probe shows what an app that tracks at
		// launch sends before any decision.
		if (
			process.env.C15T_APP_E2E_SCENARIO === 'adapter' ||
			!vendors.startupSettled ||
			status.policyPending ||
			status.promptRequirement.kind === 'none'
		) {
			return;
		}
		void requestPresentation(false, setError);
	}, [
		status.policyPending,
		status.promptRequirement.kind,
		vendors.startupSettled,
	]);
	const checkSession = async () => {
		const first = await presentPreferences(privacyPolicyURL);
		const repeated = await presentPreferences(privacyPolicyURL);
		await closeConsentPresenter('obsolete-session');
		await fetch(`${endpoint}/e2e/js-block`, {
			body: JSON.stringify({ sessionProbe: { first, repeated } }),
			method: 'POST',
		});
	};
	const blockJS = async () => {
		const presentation = await presentPreferences(privacyPolicyURL);
		await fetch(`${endpoint}/e2e/js-block`, {
			body: JSON.stringify({
				blocked: true,
				outcomesBefore: outcomes.length,
				presentation,
			}),
			method: 'POST',
		});
		const end = Date.now() + 90000;
		while (Date.now() < end) {
			/* Deliberately occupy Hermes for the native acceptance journey. */
		}
		await fetch(`${endpoint}/e2e/js-block`, {
			body: JSON.stringify({ blocked: false }),
			method: 'POST',
		});
	};
	const blockJSForRecreation = async () => {
		await fetch(`${endpoint}/e2e/js-block`, {
			body: JSON.stringify({
				blocked: true,
				outcomesBefore: outcomes.length,
				presentations,
			}),
			method: 'POST',
		});
		const end = Date.now() + 30000;
		while (Date.now() < end) {
			/* The fixture's Activity must recover without JS. */
		}
		await fetch(`${endpoint}/e2e/js-block`, {
			body: JSON.stringify({ blocked: false }),
			method: 'POST',
		});
	};
	useEffect(() => {
		if (process.env.C15T_APP_E2E !== '1') {
			return;
		}
		const timer = setInterval(() => {
			void fetch(`${endpoint}/e2e/js-block`, {
				body: JSON.stringify({ outcomes, presentations }),
				method: 'POST',
			});
		}, 500);
		return () => clearInterval(timer);
	}, []);
	return (
		<View style={{ flex: 1, gap: 24, padding: 32, paddingTop: 80 }}>
			<Text accessibilityRole="header">Inth native consent</Text>
			<Button
				testID="fixture.open-preferences"
				title="Privacy settings"
				onPress={open}
			/>
			<Button
				testID="fixture.present-prompt"
				title="Review privacy notice"
				onPress={() => {
					void requestPresentation(false, setError);
				}}
			/>
			{process.env.C15T_APP_E2E === '1' ? (
				<View style={{ gap: 16 }}>
					<Button
						testID="fixture.vendor-probe"
						title="Send a vendor probe"
						onPress={handleVendorProbe}
					/>
					<Button
						testID="fixture.host-action"
						title="Host action"
						onPress={() => {
							setHostActions((value) => value + 1);
						}}
					/>
					<Text testID="fixture.host-count">{hostActions}</Text>
					<Button
						testID="fixture.repeat-preferences"
						title="Check native session reuse"
						onPress={() => {
							void checkSession();
						}}
					/>
					<Button
						testID="fixture.block-js-recreation"
						title="Block JS for native Activity recreation"
						onPress={() => {
							void blockJSForRecreation();
						}}
					/>
					<Button
						testID="fixture.block-js"
						title="Open native settings and block JS for 90 seconds"
						onPress={() => {
							void blockJS();
						}}
					/>
				</View>
			) : null}
			<Text testID="fixture.outcome">
				{latest ? JSON.stringify(latest) : 'No presenter outcome'}
			</Text>
			<Text>{error}</Text>
		</View>
	);
};
