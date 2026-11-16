// #region docs:rn-branch-integration title="branch-consent.ts"
import { connectBranch } from '@c15t/react-native/integrations';
import type {
	BranchClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppBranch = (
	branch: BranchClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectBranch(branch, { onError });
// #endregion docs:rn-branch-integration
