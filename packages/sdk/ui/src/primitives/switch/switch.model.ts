import { getCheckedState } from './data-state.model';

export const getSwitchState = function getSwitchState(checked: boolean) {
	return getCheckedState(checked);
};

export const toggleSwitchValue = function toggleSwitchValue(current: boolean) {
	return !current;
};
