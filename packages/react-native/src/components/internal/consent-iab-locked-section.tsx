import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ConsentIabDisplayRow } from '../iab-display.model';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';
import type { ConsentTheme } from '../theme/create-consent-theme';
import { ConsentIabPurposeRow } from './consent-iab-purpose-row';
import type { ConsentIabCopy } from './iab-copy.model';
import { withCount } from './iab-copy.model';
import {
	hitSlopFor,
	LABEL_ROW,
	STACKED,
	TEXT_COLUMN,
} from './iab-row-layout.model';

/**
 * The locked essential-functions section: special purposes, each rendered on and
 * impossible to move. Features have their own section,
 * {@link ConsentIabFeatureSection}.
 *
 * @param props - Section props.
 * @param props.copy - Copy in force.
 * @param props.parts - Parts in force.
 * @param props.rows - The locked rows, in render order.
 * @param props.theme - Theme in force.
 * @param props.vendorCount - Distinct partners the locked rows name.
 * @returns The section.
 */
export const ConsentIabLockedSection = ({
	copy,
	parts,
	rows,
	theme,
	vendorCount,
}: {
	readonly copy: ConsentIabCopy;
	readonly parts: ConsentResolvedParts;
	readonly rows: ConsentIabDisplayRow[];
	readonly theme: ConsentTheme;
	readonly vendorCount: number;
}): ReactNode => {
	const [open, setOpen] = useState(false);

	return (
		<View
			style={parts.rowCard}
			testID="iab-essential-section"
		>
			<Pressable
				accessibilityLabel={copy.essentialTitle}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				hitSlop={hitSlopFor(parts)}
				onPress={() => {
					setOpen(!open);
				}}
				style={parts.rowHeader}
			>
				<View style={LABEL_ROW}>
					{/*
					 * A padlock rather than a plus, and it is the section that carries it
					 * rather than each row inside: `.lockIcon` is 12pt in the muted tone
					 * beside `Essential Functions (Required)`, which is the line that
					 * tells the subject why nothing below it can be moved.
					 */}
					<View
						accessibilityElementsHidden
						style={{
							borderColor: parts.rowLock.borderColor,
							borderTopLeftRadius: 3,
							borderTopRightRadius: 3,
							borderWidth: 1.5,
							height: 6,
							marginTop: 3,
							width: 10,
						}}
					/>
					<View style={TEXT_COLUMN}>
						<Text style={parts.rowTitle}>{copy.essentialTitle}</Text>
						<Text style={parts.rowMeta}>
							{withCount(copy.partners, vendorCount)}
						</Text>
					</View>
				</View>
			</Pressable>
			{open ? (
				<View style={[parts.rowContent, STACKED, { marginTop: 0 }]}>
					{rows.map((row) => (
						<ConsentIabPurposeRow
							copy={copy}
							key={row.testId}
							nested
							onToggle={() => {
								// A locked row's switch is disabled, so this never runs; the
								// row still needs the prop to draw the same control as every
								// other row on the surface.
							}}
							parts={parts}
							row={row}
							selected
							theme={theme}
						/>
					))}
				</View>
			) : null}
		</View>
	);
};
