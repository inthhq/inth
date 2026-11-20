'use client';

import type { FC } from 'react';

import { OptOutConfirmationOverlay, Overlay } from './atoms/overlay';
import {
	Card,
	Description,
	DoneButton,
	Footer,
	Header,
	OptOutConfirmationCard,
	OptOutConfirmationDescription,
	OptOutConfirmationDoneButton,
	OptOutConfirmationFooter,
	OptOutConfirmationHeader,
	OptOutConfirmationPreferencesLink,
	OptOutConfirmationStatus,
	OptOutConfirmationTitle,
	PreferencesLink,
	Status,
	Title,
} from './atoms/parts';
import { OptOutConfirmationRoot, Root } from './atoms/root';
import { OptOutConfirmation as OptOutConfirmationComponent } from './opt-out-confirmation';
import type { OptOutConfirmationProps } from './opt-out-confirmation';

export type { OptOutConfirmationProps };
export type { OptOutConfirmationOverlayProps } from './atoms/overlay';
export type {
	OptOutConfirmationDoneButtonProps,
	OptOutConfirmationPreferencesLinkProps,
} from './atoms/parts';
export type { OptOutConfirmationRootProps } from './atoms/root';

export interface OptOutConfirmationCompoundComponent extends FC<OptOutConfirmationProps> {
	Card: typeof Card;
	Description: typeof Description;
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
	DoneButton,
	Footer,
	Header,
	OptOutConfirmation,
	OptOutConfirmationCard,
	OptOutConfirmationDescription,
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
