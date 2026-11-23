import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ConsentIabDisplayRow } from '../iab-display.model';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';
import type { ConsentTheme } from '../theme/create-consent-theme';
import {
	CONSENT_IAB_DISCLOSURE_GEOMETRY,
	CONSENT_IAB_SWITCH_GEOMETRY,
} from '../theme/use-consent-styles';
import { ConsentDisclosureGlyph } from './consent-disclosure-glyph';
import { ConsentSwitch } from './consent-switch';
import type { ConsentIabCopy } from './iab-copy.model';
import { withCount } from './iab-copy.model';
import {
	CONTROL_COLUMN,
	hitSlopFor,
	LABEL_ROW,
	TEXT_COLUMN,
} from './iab-row-layout.model';

/**
 * One purpose row.
 *
 * @param props - Row props.
 * @param props.copy - Copy in force.
 * @param props.nested - Whether the row sits inside a stack's band.
 * @param props.onToggle - Called with the position the switch moved to.
 * @param props.parts - Parts in force.
 * @param props.row - Row to render.
 * @param props.selected - Whether the row's own consent is held.
 * @param props.theme - Theme in force.
 * @returns The row.
 */
export const ConsentIabPurposeRow = ({
	copy,
	nested = false,
	onToggle,
	parts,
	row,
	selected,
	theme,
}: {
	readonly copy: ConsentIabCopy;
	readonly nested?: boolean;
	readonly onToggle: (value: boolean) => void;
	readonly parts: ConsentResolvedParts;
	readonly row: ConsentIabDisplayRow;
	readonly selected: boolean;
	readonly theme: ConsentTheme;
}): ReactNode => {
	const [open, setOpen] = useState(false);

	return (
		<View
			style={parts.rowCard}
			testID={row.testId}
		>
			<Pressable
				accessibilityLabel={row.name}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				hitSlop={hitSlopFor(parts)}
				onPress={() => {
					setOpen((current) => !current);
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
						<Text style={parts.rowTitle}>{row.name}</Text>
						<Text style={parts.rowMeta}>
							{withCount(copy.partners, row.vendors.length)}
						</Text>
					</View>
				</View>
				<View style={CONTROL_COLUMN}>
					<ConsentSwitch
						disabled={row.locked}
						geometry={CONSENT_IAB_SWITCH_GEOMETRY}
						label={row.name}
						onValueChange={onToggle}
						parts={parts}
						theme={theme}
						value={row.locked || selected}
					/>
				</View>
			</Pressable>
			{open ? (
				<View style={[parts.rowContent, nested ? { marginTop: 0 } : undefined]}>
					<Text style={parts.rowDescription}>{row.description}</Text>
				</View>
			) : null}
		</View>
	);
};
