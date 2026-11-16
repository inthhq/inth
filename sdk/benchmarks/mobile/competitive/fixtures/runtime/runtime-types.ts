export interface RuntimeConsent {
	open: () => void;
	ready: boolean;
	snapshot: unknown;
	targetId: string | null;
}
