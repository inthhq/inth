#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit

/// Explicit app branding overrides the stock provider mark and placeholder label.
struct ResolvedIdentity {
    var name: String
    var icon: UIImage?
    var provider: ConsentTheme.Branding?

    /// `placeholder` stands in for a brand with no name, in the screen's language.
    static func resolve(_ brand: ConsentTheme.Brand, provider: ConsentTheme.Branding, placeholder: String,
        bundle: Bundle = .main) -> ResolvedIdentity {
        let name = brand.name ?? placeholder
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

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: tileSize * 0.22, style: .continuous)
    }

    @ViewBuilder private var tile: some View {
        if let provider = identity.provider {
            ConsentProviderMark(branding: provider).fill(style: FillStyle(eoFill: true))
                .foregroundStyle(theme.colors.text.color)
                .frame(width: markSize, height: markSize)
        } else if let icon = identity.icon {
            Image(uiImage: icon).resizable().scaledToFill().frame(width: tileSize, height: tileSize)
                .clipShape(shape).overlay(shape.strokeBorder(.black.opacity(0.08)))
        } else {
            ZStack {
                shape.fill(theme.colors.accent.color.opacity(0.12))
                Text(String(identity.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased())
                    .font(theme.headlineFont.font(.title, weight: .semibold))
                    .foregroundStyle(theme.colors.accent.color)
            }.frame(width: tileSize, height: tileSize)
        }
    }
}
#endif
