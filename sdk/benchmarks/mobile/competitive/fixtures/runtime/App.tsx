import { useRef } from 'react';
import { Button, NativeModules, Text, View } from 'react-native';

import { ConsentBoundary, useRuntimeConsent } from './consent-adapter';

const Screen = () => {
	const state = useRuntimeConsent();
	const marked = useRef(false);
	const handleReadyLayout = async () => {
		if (marked.current) {
			return;
		}
		marked.current = true;
		try {
			await NativeModules.CmpBenchmark.readyLayout();
			NativeModules.CmpBenchmark.snapshot(
				JSON.stringify({
					raw: state.snapshot,
					targetId: state.targetId,
					valid: true,
				})
			);
		} catch (error) {
			console.error(error);
		}
	};
	return (
		<View style={{ padding: 32 }}>
			{state.ready ? (
				<View
					key="ready"
					collapsable={false}
					onLayout={handleReadyLayout}
				>
					<Text>Ready</Text>
					<Text>Stored optional consent is denied</Text>
					<Text>{state.targetId}</Text>
				</View>
			) : (
				<Text>Starting, waiting for a recorded rejection</Text>
			)}
			<Button
				title="Privacy settings"
				onPress={() => state.open()}
			/>
			<Button
				title="Capture current state"
				onPress={() =>
					NativeModules.CmpBenchmark.snapshot(
						JSON.stringify({
							raw: state.snapshot,
							targetId: state.targetId,
							valid: state.ready,
						})
					)
				}
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
