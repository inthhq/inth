/**
 * `@c15t/angular/primitives`: the unstyled building blocks of the stock
 * dialog and widget (switch, accordion, collapsible, tabs, dialog and
 * preference item), with the framework-agnostic primitive helpers and
 * class maps from `@c15t/ui`.
 *
 * @packageDocumentation
 */

export * from '@c15t/ui/primitives';
export * from '@c15t/ui/styles/primitives';
export {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from './accordion';
export {
	Collapsible,
	CollapsibleContent,
	CollapsibleIndicator,
	CollapsibleTrigger,
} from './collapsible';
export {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogPositioner,
	DialogTitle,
} from './dialog';
export type { DialogCloseReason } from './dialog';
export {
	PreferenceItem,
	PreferenceItemAuxiliary,
	PreferenceItemBody,
	PreferenceItemContent,
	PreferenceItemControl,
	PreferenceItemHeader,
	PreferenceItemLeading,
	PreferenceItemMeta,
	PreferenceItemTitle,
	PreferenceItemTrigger,
} from './preference-item';
export {
	Switch,
	SwitchControl,
	SwitchHiddenInput,
	SwitchThumb,
} from './switch';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
export { uniqueId } from './unique-id';
