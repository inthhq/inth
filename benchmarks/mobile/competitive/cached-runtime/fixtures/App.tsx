import { useEffect, useRef, useState } from 'react';
import { AppState, Button, NativeModules, Text, View } from 'react-native';

import { ConsentBoundary, useRuntimeConsent } from './consent-adapter';
import type { RuntimeRead } from './runtime-types';

const native = NativeModules.CmpBenchmark;
const snapshot = (kind: string, read: RuntimeRead) =>
	native.snapshot(
		JSON.stringify({
			kind,
			raw: read.snapshot,
			targetId: read.targetId,
			valid: read.ready,
		})
	);

const Screen = () => {
	const state = useRuntimeConsent();
	const latest = useRef(state);
	const marked = useRef(false);
	const sequence = useRef(0);
	const [warm, setWarm] = useState<{
		read: RuntimeRead;
		sequence: number;
	} | null>(null);
	useEffect(() => {
		latest.current = state;
	}, [state]);
	useEffect(() => {
		let background = false;
		const reopen = async () => {
			try {
				const read = await latest.current.reload();
				sequence.current += 1;
				setWarm({ read, sequence: sequence.current });
			} catch (error) {
				console.error(error);
			}
		};
		const sub = AppState.addEventListener('change', (status) => {
			if (status === 'background') {
				background = true;
			}
			if (status === 'active' && background) {
				background = false;
				void reopen();
			}
		});
		return () => sub.remove();
	}, []);
	return (
		<View style={{ padding: 32 }}>
			{state.ready ? (
				<View
					key="ready"
					collapsable={false}
					onLayout={async () => {
						if (marked.current) {
							return;
						}
						marked.current = true;
						try {
							await native.readyLayout();
							snapshot('cold', state);
						} catch (error) {
							console.error(error);
						}
					}}
				>
					<Text>Ready</Text>
					<Text>Stored optional consent is denied</Text>
					<Text>{state.targetId}</Text>
				</View>
			) : (
				<Text>Starting, waiting for a recorded rejection</Text>
			)}
			{warm?.read.ready ? (
				<View
					key={warm.sequence}
					collapsable={false}
					onLayout={async () => {
						try {
							await native.warmLayout();
							snapshot('warm', warm.read);
						} catch (error) {
							console.error(error);
						}
					}}
				>
					<Text>Warm ready</Text>
				</View>
			) : null}
			<Button
				title="Privacy settings"
				onPress={async () => {
					await native.actionStart('UI_OPEN_INVOKED');
					latest.current.open();
				}}
			/>
			<Button
				title="Reload cached state"
				onPress={async () => {
					await latest.current.reload();
				}}
			/>
			<Button
				title="Capture current state"
				onPress={async () => {
					snapshot('diagnostic', await latest.current.reload());
				}}
			/>
		</View>
	);
};

const App = () => (
	<ConsentBoundary>
		<Screen />
	</ConsentBoundary>
);
export default App;
