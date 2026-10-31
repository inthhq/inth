export interface RuntimeRead {
	ready: boolean;
	targetId: string | null;
	snapshot: unknown;
}
export interface RuntimeConsent extends RuntimeRead {
	open: () => void;
	reload: () => Promise<RuntimeRead>;
}
