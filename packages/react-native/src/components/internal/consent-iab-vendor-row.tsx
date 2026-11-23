import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type {
	ConsentIabDisplayModel,
	ConsentIabProcessedVendor,
} from '../iab-display.model';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';
import type { ConsentTheme } from '../theme/create-consent-theme';
import {
	CONSENT_IAB_DISCLOSURE_GEOMETRY,
	CONSENT_IAB_SWITCH_GEOMETRY,
} from '../theme/use-consent-styles';
import { ConsentDisclosureGlyph } from './consent-disclosure-glyph';
import { ConsentSwitch } from './consent-switch';
import type { ConsentIabCopy } from './iab-copy.model';
import { partnerClaims, withTotal } from './iab-copy.model';
import {
	CONTROL_COLUMN,
	hitSlopFor,
	LABEL_ROW,
	STACKED,
	TEXT_COLUMN,
} from './iab-row-layout.model';
import { consentIabVendorTestId, vendorLegs } from './iab-vendor-rows.model';

/**
 * One partner: its name, the two legal bases it claims under, and the purposes
 * behind each once the row is opened.
 *
 * @param props - Partner props.
 * @param props.copy - Copy in force.
 * @param props.model - Model in force, which turns a claimed id into a name.
 * @param props.onToggleConsent - Records the partner's consent.
 * @param props.onToggleObjection - Records an objection to the claim.
 * @param props.parts - Parts in force.
 * @param props.theme - Theme in force.
 * @param props.vendor - Partner to render.
 * @param props.vendorConsented - Whether consent for this partner is held.
 * @param props.vendorLegitimateInterest - Whether the claim is unobjected.
 * @returns The partner row.
 */
export const ConsentIabVendorRow = ({
	copy,
	model,
	onToggleConsent,
	onToggleObjection,
	parts,
	theme,
	vendor,
	vendorConsented,
	vendorLegitimateInterest,
}: {
	readonly copy: ConsentIabCopy;
	readonly model: ConsentIabDisplayModel;
	readonly onToggleConsent: (value: boolean) => void;
	readonly onToggleObjection: (value: boolean) => void;
	readonly parts: ConsentResolvedParts;
	readonly theme: ConsentTheme;
	readonly vendor: ConsentIabProcessedVendor;
	readonly vendorConsented: boolean;
	readonly vendorLegitimateInterest: boolean;
}): ReactNode => {
	const [open, setOpen] = useState(false);
	const legs = vendorLegs(model, vendor);
	const objected = vendorLegitimateInterest === false;
	const lists: { key: string; label: string; names: string[] }[] = [
		{
			key: 'purposes',
			label: withTotal(copy.purposes, legs.purposes.length),
			names: legs.purposes,
		},
		{
			key: 'specialPurposes',
			label: withTotal(copy.specialPurposes, legs.specialPurposes.length),
			names: legs.specialPurposes,
		},
		{
			key: 'specialFeatures',
			label: withTotal(copy.specialFeatures, legs.specialFeatures.length),
			names: legs.specialFeatures,
		},
		{
			key: 'features',
			label: withTotal(copy.features, legs.features.length),
			names: legs.features,
		},
	].filter((list) => list.names.length > 0);

	return (
		<View
			style={[parts.rowCard, { backgroundColor: 'transparent' }]}
			testID={consentIabVendorTestId(vendor.id)}
		>
			<Pressable
				accessibilityLabel={vendor.name}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				hitSlop={hitSlopFor(parts)}
				onPress={() => {
					setOpen(!open);
				}}
				style={{
					...parts.rowHeader,
					gap: 8,
					padding: 10,
				}}
			>
				<View style={LABEL_ROW}>
					<ConsentDisclosureGlyph
						geometry={CONSENT_IAB_DISCLOSURE_GEOMETRY}
						open={open}
						parts={parts}
						theme={theme}
					/>
					<View style={TEXT_COLUMN}>
						<Text style={parts.rowTitle}>{vendor.name}</Text>
						<Text style={parts.rowMeta}>
							{partnerClaims({
								features: legs.features.length,
								purposes: legs.purposes.length,
								specialPurposes: legs.specialPurposes.length,
							})}
						</Text>
					</View>
				</View>
				<View style={CONTROL_COLUMN}>
					<ConsentSwitch
						disabled={false}
						geometry={CONSENT_IAB_SWITCH_GEOMETRY}
						label={vendor.name}
						onValueChange={onToggleConsent}
						parts={parts}
						theme={theme}
						value={vendorConsented}
					/>
				</View>
			</Pressable>
			{open ? (
				<View style={parts.vendorContent}>
					{lists.map((list) => (
						<View
							key={list.key}
							style={STACKED}
						>
							<Text style={parts.rowSectionTitle}>{list.label}</Text>
							{list.names.map((name) => (
								<Text
									key={name}
									style={parts.rowListItem}
								>
									{name}
								</Text>
							))}
						</View>
					))}
					{legs.legitimateInterest.length > 0 ? (
						<View
							style={STACKED}
							testID={`vendor-legitimate-interest-${String(vendor.id)}`}
						>
							<View
								style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
							>
								<Text style={parts.rowSectionTitle}>
									{withTotal(
										copy.legitimateInterest,
										legs.legitimateInterest.length
									)}
								</Text>
								<Pressable
									accessibilityLabel={`${copy.legitimateInterest}: ${vendor.name}`}
									accessibilityRole="button"
									accessibilityState={{ selected: objected }}
									hitSlop={{ bottom: 10, left: 10, right: 10, top: 10 }}
									onPress={() => {
										onToggleObjection(objected);
									}}
									style={[
										parts.objectButton,
										objected && {
											backgroundColor: theme.colors.textMuted,
											borderColor: theme.colors.textMuted,
										},
									]}
								>
									<Text
										style={[
											parts.objectLabel,
											objected && { color: theme.colors.surface },
										]}
									>
										{objected ? copy.objected : copy.objectButton}
									</Text>
								</Pressable>
							</View>
							{legs.legitimateInterest.map((name) => (
								<Text
									key={name}
									style={parts.rowListItem}
								>
									{name}
								</Text>
							))}
							<Text style={parts.rowNotice}>{copy.rightToObject}</Text>
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
};
