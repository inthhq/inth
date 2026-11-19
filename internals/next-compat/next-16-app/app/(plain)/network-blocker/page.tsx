import { ChildBeacon } from '@inth/next-compat-shared/network-beacons';

const NetworkBlockerPage = () => (
	<>
		<p>Tracker calls at module evaluation and at mount.</p>
		<ChildBeacon />
	</>
);

export default NetworkBlockerPage;
