import { getOpenState } from './data-state.model';

export const getCollapsibleState = function getCollapsibleState(open: boolean) {
	return getOpenState(open);
};

export const toggleCollapsibleValue = function toggleCollapsibleValue(
	current: boolean
) {
	return !current;
};
