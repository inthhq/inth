/**
 * Injection keys shared by the own primitives.
 */
import type { InjectionKey, Ref } from 'vue';

export const switchCheckedKey: InjectionKey<Ref<boolean>> = Symbol(
	'inth:switch-checked'
);

export interface DialogContext {
	open: () => boolean;
	modal: () => boolean;
	close: () => void;
}
export const dialogContextKey: InjectionKey<DialogContext> =
	Symbol('inth:dialog');

export interface AccordionContext {
	isOpen: (value: string) => boolean;
	toggle: (value: string) => void;
}
export const accordionContextKey: InjectionKey<AccordionContext> =
	Symbol('inth:accordion');

export interface AccordionItemContext {
	value: string;
	open: () => boolean;
	toggle: () => void;
}
export const accordionItemContextKey: InjectionKey<AccordionItemContext> =
	Symbol('inth:accordion-item');
