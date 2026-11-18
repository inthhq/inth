/**
 * The app a build without the stock native consent screens runs: its own
 * banner, preferences screen and IAB screen, built only from the headless
 * hooks. `INTH_NATIVE_UI=0 expo prebuild` makes that build; see
 * `app.config.ts`.
 */

import {
	ConsentPrompt,
	useConsentDraft,
	useDismissNotice,
	useIAB,
	useIABSnapshot,
	usePurposeConsent,
	useSaveConsents,
	useSnapshot,
	useTCString,
	useVendorConsent,
} from '@inth/react-native';
import type {
	AllConsentNames,
	CommitResult,
	IABDraftHandle,
} from '@inth/react-native';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { Button, Card, Hint } from '../components/ui';

const LABELS: Record<AllConsentNames, string> = {
	experience: 'Personalization',
	functionality: 'Preferences',
	marketing: 'Marketing',
	measurement: 'Analytics',
	necessary: 'Required',
};

/** Report one commit result the way every screen here does. */
const describeResult = (result: CommitResult): string =>
	result.ok ? 'Saved on this device.' : `Nothing saved: ${result.reason}.`;

/** The first prompt, drawn by the app while one is owed. */
const CustomBanner = ({ onCustomize }: { onCustomize: () => void }) => {
	const save = useSaveConsents();
	const dismissNotice = useDismissNotice();
	const [message, setMessage] = useState('');
	const decide = async (input: 'all' | 'none') => {
		setMessage(describeResult(await save(input)));
	};

	return (
		<ConsentPrompt>
			{({ promptRequirement }) =>
				promptRequirement.kind === 'notice' ? (
					<Card title="How this app uses data">
						<Button
							label="Got it"
							onPress={() => {
								dismissNotice();
							}}
						/>
					</Card>
				) : (
					<Card title="Your privacy choices">
						<Hint>
							We use data to measure the app and to show relevant offers. You
							can change this at any time in Privacy settings.
						</Hint>
						<Button
							label="Accept all"
							onPress={() => {
								void decide('all');
							}}
						/>
						<Button
							label="Reject all"
							onPress={() => {
								void decide('none');
							}}
						/>
						<Button
							label="Customize"
							onPress={onCustomize}
						/>
						<Text accessibilityLiveRegion="polite">{message}</Text>
					</Card>
				)
			}
		</ConsentPrompt>
	);
};

/** Category choices staged in the shared draft, saved together. */
const CustomPreferences = ({ onDone }: { onDone: () => void }) => {
	const draft = useConsentDraft();
	const [message, setMessage] = useState('');
	const saveDraft = async () => {
		const result = await draft.save();
		setMessage(describeResult(result));
		if (result.ok) {
			onDone();
		}
	};

	return (
		<Card title="Privacy settings">
			{draft.displayedCategories.map((category) => (
				<View
					key={category}
					style={{ flexDirection: 'row', justifyContent: 'space-between' }}
				>
					<Text>{LABELS[category]}</Text>
					<Switch
						accessibilityLabel={`Allow ${LABELS[category]}`}
						disabled={category === 'necessary'}
						testID={`fixture.headless.${category}`}
						value={draft.values[category]}
						onValueChange={(value) => {
							draft.set(category, value);
						}}
					/>
				</View>
			))}
			<Button
				label="Save choices"
				onPress={() => {
					void saveDraft();
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</Card>
	);
};

const PurposeRow = ({
	iab,
	id,
	name,
}: {
	iab: IABDraftHandle;
	id: number;
	name: string;
}) => {
	const allowed = usePurposeConsent(id);
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
			<Text style={{ flex: 1 }}>{name}</Text>
			<Switch
				accessibilityLabel={`Allow ${name}`}
				value={allowed}
				onValueChange={(value) => {
					iab.setPurposeConsent(id, value);
				}}
			/>
		</View>
	);
};

const VendorRow = ({
	iab,
	id,
	name,
}: {
	iab: IABDraftHandle;
	id: number;
	name: string;
}) => {
	const allowed = useVendorConsent(id);
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
			<Text style={{ flex: 1 }}>{name}</Text>
			<Switch
				accessibilityLabel={`Allow ${name}`}
				value={allowed}
				onValueChange={(value) => {
					iab.setVendorConsent(id, value);
				}}
			/>
		</View>
	);
};

/** TCF purposes and partners, staged and saved through the native engine. */
const CustomIabScreen = ({
	iab,
	onDone,
}: {
	iab: IABDraftHandle;
	onDone: () => void;
}) => {
	const list = useIABSnapshot()?.gvl;
	const tcString = useTCString();
	const [message, setMessage] = useState('');
	const saveIab = async () => {
		const result = await iab.save();
		setMessage(describeResult(result));
		if (result.ok) {
			onDone();
		}
	};

	return (
		<Card title="Purposes and partners">
			{Object.entries(list?.purposes ?? {}).map(([id, purpose]) => (
				<PurposeRow
					key={`purpose-${id}`}
					iab={iab}
					id={Number(id)}
					name={purpose.name}
				/>
			))}
			{Object.entries(list?.vendors ?? {})
				.filter(([, vendor]) => !vendor.deletedDate)
				.map(([id, vendor]) => (
					<VendorRow
						key={`vendor-${id}`}
						iab={iab}
						id={Number(id)}
						name={vendor.name}
					/>
				))}
			<Button
				label={iab.isStale ? 'Review the new partner list' : 'Save choices'}
				onPress={() => {
					if (iab.isStale) {
						iab.reset();
						return;
					}
					void saveIab();
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
			<Text
				selectable
				testID="fixture.headless.tc-string"
			>
				{tcString ?? 'No TC String committed yet.'}
			</Text>
		</Card>
	);
};

/** The shell of a build without the stock native consent screens. */
export const HeadlessConsentApp = () => {
	const snapshot = useSnapshot();
	const iab = useIAB();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const close = () => {
		setSettingsOpen(false);
	};

	return (
		<ScrollView
			contentContainerStyle={{ gap: 16, padding: 24, paddingTop: 72 }}
		>
			<Text accessibilityRole="header">Inth Expo, custom consent UI</Text>
			<Hint>
				This binary links no stock consent screens. Everything below is app code
				on the headless hooks.
			</Hint>
			{settingsOpen ? null : (
				<CustomBanner
					onCustomize={() => {
						setSettingsOpen(true);
					}}
				/>
			)}
			<Button
				label="Privacy settings"
				onPress={() => {
					setSettingsOpen(true);
				}}
			/>
			{settingsOpen && iab !== null ? (
				<CustomIabScreen
					iab={iab}
					onDone={close}
				/>
			) : null}
			{settingsOpen && iab === null ? (
				<CustomPreferences onDone={close} />
			) : null}
			<Text testID="fixture.headless.state">
				{JSON.stringify({
					model: snapshot.model,
					permissions: snapshot.effectivePermissions,
					prompt: snapshot.promptRequirement.kind,
				})}
			</Text>
		</ScrollView>
	);
};
