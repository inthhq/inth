import * as Accordion from '@inth/react/primitives/accordion';
import * as Button from '@inth/react/primitives/button';
import * as Dialog from '@inth/react/primitives/dialog';
import * as Switch from '@inth/react/primitives/switch';
import { createElement } from 'react';

export const PrimitiveBench = () => (
	<div>
		<Button.Root>Button</Button.Root>
		<Switch.Root aria-label="Analytics" />
		<Accordion.Root
			type="single"
			collapsible
		>
			<Accordion.Item value="one">
				<Accordion.Trigger>Accordion</Accordion.Trigger>
				<Accordion.Content>Content</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
		<Dialog.Root open>
			<Dialog.Portal>
				<Dialog.Content>
					<Dialog.Title>Dialog</Dialog.Title>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	</div>
);

export default createElement(PrimitiveBench);
