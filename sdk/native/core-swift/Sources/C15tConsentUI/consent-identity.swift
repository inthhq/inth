#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit

/// Explicit app branding overrides the stock provider mark and placeholder label.
struct ResolvedIdentity {
    var name: String
    var icon: UIImage?
    var provider: ConsentTheme.Branding?

    static func resolve(_ brand: ConsentTheme.Brand, provider: ConsentTheme.Branding, bundle: Bundle = .main) -> ResolvedIdentity {
        let name = brand.name ?? "Your brand here"
        if let mark = brand.markImageName {
            return ResolvedIdentity(name: name, icon: UIImage(named: mark, in: bundle, with: nil) ?? UIImage(named: mark))
        }
        switch provider {
        case .c15t, .inth:
            return ResolvedIdentity(name: name, provider: provider)
        case .custom(_, let mark):
            return ResolvedIdentity(name: name, icon: mark.flatMap { UIImage(named: $0, in: bundle, with: nil) ?? UIImage(named: $0) })
        }
    }
}

/// The mark is decorative; the brand label is announced once.
struct IdentityHeader: View {
    let identity: ResolvedIdentity
    @Environment(\.consentTheme) private var theme
    /// A host's own image or initial sits in a tile.
    @ScaledMetric(relativeTo: .largeTitle) private var tileSize: CGFloat = 56
    /// A bundled provider mark has no tile, so it starts at the text edge like the headline.
    @ScaledMetric(relativeTo: .largeTitle) private var markSize: CGFloat = 40

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            tile.accessibilityHidden(true)
            Text(identity.name.uppercased()).font(.footnote.weight(.semibold)).tracking(1.4)
                .foregroundStyle(theme.colors.accent.color)
                .accessibilityLabel(identity.name).accessibilityIdentifier("c15t.first-layer.brand")
        }
    }

    /// The host tiles are their own views, so the stock mark never builds their types.
    @ViewBuilder private var tile: some View {
        if let provider = identity.provider {
            ConsentProviderMark(branding: provider).fill(style: FillStyle(eoFill: true))
                .foregroundStyle(theme.colors.text.color)
                .frame(width: markSize, height: markSize)
        } else if let icon = identity.icon {
            IconTile(icon: icon, size: tileSize)
        } else {
            InitialTile(name: identity.name, size: tileSize)
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
            tileShape(size).fill(theme.colors.accent.color.opacity(0.12))
            Text(String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased())
                .font(theme.headlineFont.font(.title, weight: .semibold))
                .foregroundStyle(theme.colors.accent.color)
        }.frame(width: size, height: size)
    }
}
#endif
