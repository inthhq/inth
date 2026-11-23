import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ConsentIabDisplayStackRow } from '../iab-display.model';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';
import type { ConsentTheme } from '../theme/create-consent-theme';
import {
	CONSENT_IAB_DISCLOSURE_GEOMETRY,
	CONSENT_IAB_SWITCH_GEOMETRY,
} from '../theme/use-consent-styles';
import { ConsentDisclosureGlyph } from './consent-disclosure-glyph';
import { ConsentIabPurposeRow } from './consent-iab-purpose-row';
import { ConsentSwitch } from './consent-switch';
import type { ConsentIabCopy } from './iab-copy.model';
import { withCount } from './iab-copy.model';
import {
	CONTROL_COLUMN,
	hitSlopFor,
	LABEL_ROW,
	TEXT_COLUMN,
} from './iab-row-layout.model';
import { distinctVendorCount } from './iab-vendor-rows.model';

/**
 * One stack: a header that decides N purposes at once, and those purposes listed
 * underneath it as the rows they really are.
 *
 * Its switch reads `on` only when every member is on, and one press moves them
 * all, which is what the web's own stack control does. When they are split the
 * dot beside the switch says so, and the switch's own label carries the same
 * words for a reader: a switch that reads `on` over half-granted purposes would
 * tell the subject something untrue.
 *
 * @param props - Stack props.
 * @param props.copy - Copy in force.
 * @param props.onTogglePurpose - Records one member purpose.
 * @param props.parts - Parts in force.
 * @param props.stack - Stack to render.
 * @param props.theme - Theme in force.
 * @param props.values - Position of every purpose on the surface, by id.
 * @returns The stack.
 */
export const ConsentIabStackRow = ({
	copy,
	onTogglePurpose,
	parts,
	stack,
	theme,
	values,
}: {
	readonly copy: ConsentIabCopy;
	readonly onTogglePurpose: (purposeId: number, value: boolean) => void;
	readonly parts: ConsentResolvedParts;
	readonly stack: ConsentIabDisplayStackRow;
	readonly theme: ConsentTheme;
	readonly values: Record<number, boolean>;
}): ReactNode => {
	const [open, setOpen] = useState(false);
	const isOn = (purposeId: number): boolean => values[purposeId] === true;
	const allOn = stack.purposes.every((purpose) => isOn(purpose.id));
	const someOn = stack.purposes.some((purpose) => isOn(purpose.id)) && !allOn;
	const partners = distinctVendorCount(stack.purposes);

	return (
		<View
			style={parts.rowCard}
			testID={stack.testId}
		>
			<Pressable
				accessibilityLabel={stack.name}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				hitSlop={hitSlopFor(parts)}
				onPress={() => {
					setOpen(!open);
				}}
				style={parts.rowHeader}
			>
				<View style={LABEL_ROW}>
					<ConsentDisclosureGlyph
						geometry={CONSENT_IAB_DISCLOSURE_GEOMETRY}
						open={open}
						parts={parts}
						theme={theme}
					/>
					<View style={TEXT_COLUMN}>
						<Text style={parts.rowTitle}>{stack.name}</Text>
						<Text style={parts.rowMeta}>
							{withCount(copy.partners, partners)}
						</Text>
					</View>
				</View>
				<View style={CONTROL_COLUMN}>
					{someOn ? (
						<View
							accessibilityLabel={copy.partiallyEnabled}
							accessibilityRole="image"
							style={{
								backgroundColor: theme.colors.primary,
								borderRadius: 3,
								height: 6,
								marginBottom: 4,
								width: 6,
							}}
						/>
					) : null}
					<ConsentSwitch
						disabled={false}
						geometry={CONSENT_IAB_SWITCH_GEOMETRY}
						label={
							someOn ? `${stack.name}: ${copy.partiallyEnabled}` : stack.name
						}
						onValueChange={(value) => {
							for (const purpose of stack.purposes) {
								onTogglePurpose(purpose.id, value);
							}
						}}
						parts={parts}
						theme={theme}
						value={allOn}
					/>
				</View>
			</Pressable>
			{open ? (
				<>
					<View style={[parts.rowContent, { marginTop: 0 }]}>
						<Text style={parts.rowDescription}>{stack.description}</Text>
					</View>
					<View style={parts.stackContent}>
						{stack.purposes.map((purpose) => (
							<ConsentIabPurposeRow
								copy={copy}
								key={purpose.testId}
								nested
								onToggle={(value) => {
									onTogglePurpose(purpose.id, value);
								}}
								parts={parts}
								row={purpose}
								selected={isOn(purpose.id)}
								theme={theme}
							/>
						))}
					</View>
				</>
			) : null}
		</View>
	);
};
