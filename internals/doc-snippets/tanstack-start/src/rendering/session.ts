/** Stands in for the app's own session lookup */
export const getSessionUser = (): Promise<{ readonly id: string } | null> =>
	Promise.resolve(null);
