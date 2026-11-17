#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit

/// Explicit app branding overrides the stock provider mark and placeholder label.
struct ResolvedIdentity {
    var name: String
    var icon: UIImage?
    var provider: ConsentTheme.Branding?

    /// `placeholder` stands in for a brand with no name, in the screen's language.
    /// - Parameter appIdentity: The system page and the sheet present as part of the app, so the
    ///   app's display name stands in for a missing brand name and its icon for a missing mark, each on
    ///   its own. A named brand with no mark gets the app icon, not the provider's mark beside its name.
    static func resolve(_ brand: ConsentTheme.Brand, provider: ConsentTheme.Branding, placeholder: String,
        appIdentity: Bool = false, bundle: Bundle = .main) -> ResolvedIdentity {
        let name = brand.name ?? (appIdentity ? appName(bundle) : nil) ?? placeholder
        if let mark = brand.markImageName {
            return ResolvedIdentity(name: name, icon: UIImage(named: mark, in: bundle, with: nil) ?? UIImage(named: mark))
        }
        if appIdentity, let icon = appIcon(bundle) { return ResolvedIdentity(name: name, icon: icon) }
        switch provider {
        case .c15t, .inth:
            return ResolvedIdentity(name: name, provider: provider)
        case .custom(_, let mark):
            return ResolvedIdentity(name: name, icon: mark.flatMap { UIImage(named: $0, in: bundle, with: nil) ?? UIImage(named: $0) })
        }
    }
}

extension ResolvedIdentity {
    static func appName(_ bundle: Bundle) -> String? {
        // The localized value when the app translates its name in InfoPlist.strings, else the base one.
        let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
        return name.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
    }

    /// The app's primary icon at its largest listed size.
    static func appIcon(_ bundle: Bundle) -> UIImage? {
        guard let icons = bundle.infoDictionary?["CFBundleIcons"] as? [String: Any],
              let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
              let name = (primary["CFBundleIconFiles"] as? [String])?.last ?? primary["CFBundleIconName"] as? String else { return nil }
        return UIImage(named: name, in: bundle, with: nil)
    }
}

/// The mark is decorative; the brand label is announced once.
struct IdentityHeader: View {
    let identity: ResolvedIdentity
    /// Centred over a centred headline: the mark alone, larger.
    var centered = false
    /// One row for a card: a small mark beside the name.
    var compact = false
    @Environment(\.consentTheme) private var theme
    /// A host's own image or initial sits in a tile.
    @ScaledMetric(relativeTo: .largeTitle) private var tileSize: CGFloat = 56
    /// A bundled provider mark has no tile, so it starts at the text edge like the headline.
    @ScaledMetric(relativeTo: .largeTitle) private var markSize: CGFloat = 40

    var body: some View {
        if compact {
            HStack(spacing: 10) {
                tile.accessibilityHidden(true)
                Text(identity.name).font(theme.font(.subheadline, weight: .semibold)).foregroundStyle(theme.colors.textMuted.color)
                    .accessibilityIdentifier("inth.first-layer.brand")
            }
        } else if centered {
            tile.accessibilityElement().accessibilityLabel(identity.name).accessibilityIdentifier("inth.first-layer.brand")
        } else {
            VStack(alignment: .leading, spacing: 14) {
                tile.accessibilityHidden(true)
                Text(identity.name.uppercased()).font(theme.font(.footnote, weight: .semibold)).tracking(1.4)
                    .foregroundStyle(theme.colors.primary.color)
                    .accessibilityLabel(identity.name).accessibilityIdentifier("inth.first-layer.brand")
            }
        }
    }

    /// 36pt in a card's row and 76pt centred, against 56pt at the leading edge.
    private var scale: CGFloat { compact ? 36 / 56 : centered ? 76 / 56 : 1 }

    /// The host tiles are their own views, so the stock mark never builds their types.
    @ViewBuilder private var tile: some View {
        if let provider = identity.provider {
            ConsentProviderMark(branding: provider).fill(style: FillStyle(eoFill: true))
                .foregroundStyle(theme.colors.text.color)
                .frame(width: markSize * scale, height: markSize * scale)
        } else if let icon = identity.icon {
            IconTile(icon: icon, size: tileSize * scale)
        } else {
            InitialTile(name: identity.name, size: tileSize * scale)
        }
    }
}

private func tileShape(_ size: CGFloat) -> RoundedRectangle {
    RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
}

private struct IconTile: View {
    let icon: UIImage
    let size: CGFloat
    var body: some View {
        Image(uiImage: icon).resizable().scaledToFill().frame(width: size, height: size)
            .clipShape(tileShape(size)).overlay(tileShape(size).strokeBorder(.black.opacity(0.08)))
    }
}

private struct InitialTile: View {
    let name: String
    let size: CGFloat
    @Environment(\.consentTheme) private var theme
    var body: some View {
        ZStack {
            tileShape(size).fill(theme.colors.primary.color.opacity(0.12))
            Text(String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased())
                .font(theme.typography.headlineFont.font(.title, weight: .semibold))
                .foregroundStyle(theme.colors.primary.color)
        }.frame(width: size, height: size)
    }
}
#endif
