import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ConsentIabDisplayRow } from '../iab-display.model';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';
import type { ConsentTheme } from '../theme/create-consent-theme';
import { CONSENT_IAB_DISCLOSURE_GEOMETRY } from '../theme/use-consent-styles';
import { ConsentDisclosureGlyph } from './consent-disclosure-glyph';
import type { ConsentIabCopy } from './iab-copy.model';
import { withCount } from './iab-copy.model';
import {
	hitSlopFor,
	LABEL_ROW,
	STACKED,
	TEXT_COLUMN,
} from './iab-row-layout.model';

/**
 * One feature: its name and partner count, and on expand its description,
 * illustrations and the partners that use it. No switch and no lock: TCF
 * Policies v5.0.b forbid showing a feature next to a control that cannot be
 * disabled.
 *
 * @param props - Row props.
 * @param props.copy - Copy in force.
 * @param props.parts - Parts in force.
 * @param props.row - Feature row to render.
 * @param props.theme - Theme in force.
 * @returns The row.
 */
const ConsentIabFeatureRow = ({
	copy,
	parts,
	row,
	theme,
}: {
	readonly copy: ConsentIabCopy;
	readonly parts: ConsentResolvedParts;
	readonly row: ConsentIabDisplayRow;
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
			</Pressable>
			{open ? (
				<View style={[parts.rowContent, STACKED, { marginTop: 0 }]}>
					<Text style={parts.rowDescription}>{row.description}</Text>
					{row.illustrations.map((illustration) => (
						<Text
							key={illustration}
							style={parts.rowDescription}
						>
							{illustration}
						</Text>
					))}
					{row.vendors.map((vendor) => (
						<Text
							key={vendor.id}
							style={parts.rowMeta}
						>
							{vendor.name}
						</Text>
					))}
				</View>
			) : null}
		</View>
	);
};

/**
 * The informational features section: a heading, the IAB standard text, then
 * each feature with no control.
 *
 * @param props - Section props.
 * @param props.copy - Copy in force.
 * @param props.parts - Parts in force.
 * @param props.rows - The feature rows, in render order.
 * @param props.standardText - The GVL's standard text, or `null` to use copy.
 * @param props.theme - Theme in force.
 * @returns The section, or nothing when there are no features.
 */
export const ConsentIabFeatureSection = ({
	copy,
	parts,
	rows,
	standardText,
	theme,
}: {
	readonly copy: ConsentIabCopy;
	readonly parts: ConsentResolvedParts;
	readonly rows: ConsentIabDisplayRow[];
	readonly standardText: string | null;
	readonly theme: ConsentTheme;
}): ReactNode => {
	if (rows.length === 0) {
		return null;
	}

	return (
		<View
			accessibilityLabel={copy.featuresTitle}
			style={STACKED}
			testID="iab-features-section"
		>
			<Text
				accessibilityRole="header"
				style={parts.rowTitle}
			>
				{copy.featuresTitle}
			</Text>
			<Text style={parts.rowDescription}>
				{standardText ?? copy.featuresDescription}
			</Text>
			{rows.map((row) => (
				<ConsentIabFeatureRow
					copy={copy}
					key={row.testId}
					parts={parts}
					row={row}
					theme={theme}
				/>
			))}
		</View>
	);
};
