'use client';

import type { FC } from 'react';

import {
	Card,
	OptOutConfirmationCard,
} from './atoms/opt-out-confirmation-card';
import {
	Description,
	OptOutConfirmationDescription,
} from './atoms/opt-out-confirmation-description';
import {
	Details,
	OptOutConfirmationDetails,
} from './atoms/opt-out-confirmation-details';
import {
	DoneButton,
	OptOutConfirmationDoneButton,
} from './atoms/opt-out-confirmation-done-button';
import {
	Footer,
	OptOutConfirmationFooter,
} from './atoms/opt-out-confirmation-footer';
import {
	Header,
	OptOutConfirmationHeader,
} from './atoms/opt-out-confirmation-header';
import {
	OptOutConfirmationPreferencesLink,
	PreferencesLink,
} from './atoms/opt-out-confirmation-preferences-link';
import {
	OptOutConfirmationStatus,
	Status,
} from './atoms/opt-out-confirmation-status';
import {
	OptOutConfirmationTitle,
	Title,
} from './atoms/opt-out-confirmation-title';
import { OptOutConfirmationOverlay, Overlay } from './atoms/overlay';
import { OptOutConfirmationRoot, Root } from './atoms/root';
import { OptOutConfirmation as OptOutConfirmationComponent } from './opt-out-confirmation';
import type { OptOutConfirmationProps } from './opt-out-confirmation';

export type { OptOutConfirmationProps };
export type { OptOutConfirmationOverlayProps } from './atoms/overlay';
export type { OptOutConfirmationDetailsProps } from './atoms/opt-out-confirmation-details';
export type { OptOutConfirmationDoneButtonProps } from './atoms/opt-out-confirmation-done-button';
export type { OptOutConfirmationPreferencesLinkProps } from './atoms/opt-out-confirmation-preferences-link';
export type { OptOutConfirmationRootProps } from './atoms/root';

export interface OptOutConfirmationCompoundComponent extends FC<OptOutConfirmationProps> {
	Card: typeof Card;
	Description: typeof Description;
	Details: typeof Details;
	DoneButton: typeof DoneButton;
	Footer: typeof Footer;
	Header: typeof Header;
	Overlay: typeof Overlay;
	PreferencesLink: typeof PreferencesLink;
	Root: typeof Root;
	Status: typeof Status;
	Title: typeof Title;
}

const OptOutConfirmation = Object.assign(OptOutConfirmationComponent, {
	Card,
	Description,
	Details,
	DoneButton,
	Footer,
	Header,
	Overlay,
	PreferencesLink,
	Root,
	Status,
	Title,
}) as OptOutConfirmationCompoundComponent;

export default OptOutConfirmation;

export {
	Card,
	Description,
	Details,
	DoneButton,
	Footer,
	Header,
	OptOutConfirmation,
	OptOutConfirmationCard,
	OptOutConfirmationDescription,
	OptOutConfirmationDetails,
	OptOutConfirmationDoneButton,
	OptOutConfirmationFooter,
	OptOutConfirmationHeader,
	OptOutConfirmationOverlay,
	OptOutConfirmationPreferencesLink,
	OptOutConfirmationRoot,
	OptOutConfirmationStatus,
	OptOutConfirmationTitle,
	Overlay,
	PreferencesLink,
	Root,
	Status,
	Title,
};
