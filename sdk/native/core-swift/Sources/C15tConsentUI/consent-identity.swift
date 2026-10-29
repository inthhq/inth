import Foundation
#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit
#endif

/// The host app's own name and icon, read from its bundle so the first layer belongs to the
/// app that shows it. Nothing here is fetched; a bundle without an icon gets a drawn initial.
public enum HostIdentity {
    /// Resolve through Foundation so `InfoPlist.strings` supplies the localized app name.
    static func displayName(bundle: Bundle, fallback: String) -> String {
        var info: [String: Any] = [:]
        for key in ["CFBundleDisplayName", "CFBundleName"] {
            info[key] = bundle.object(forInfoDictionaryKey: key)
        }
        return displayName(infoDictionary: info, fallback: fallback)
    }

    /// `CFBundleDisplayName`, else `CFBundleName`, else `fallback`.
    public static func displayName(infoDictionary: [String: Any], fallback: String) -> String {
        for key in ["CFBundleDisplayName", "CFBundleName"] {
            if let value = (infoDictionary[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty { return value }
        }
        return fallback
    }

    /// Image names to try for the primary icon, largest first. Compiled asset catalogues list
    /// them under `CFBundleIcons`; `CFBundleIconName` names the set itself.
    public static func iconImageNames(infoDictionary: [String: Any]) -> [String] {
        var names: [String] = []
        for iconsKey in ["CFBundleIcons", "CFBundleIcons~ipad"] {
            guard let icons = infoDictionary[iconsKey] as? [String: Any],
                let primary = icons["CFBundlePrimaryIcon"] as? [String: Any] else { continue }
            if let name = primary["CFBundleIconName"] as? String, !name.isEmpty { names.append(name) }
            if let files = primary["CFBundleIconFiles"] as? [String] { names.append(contentsOf: files.reversed()) }
        }
        if let files = infoDictionary["CFBundleIconFiles"] as? [String] { names.append(contentsOf: files.reversed()) }
        var seen = Set<String>()
        return names.filter { seen.insert($0).inserted }
    }

    /// The letter a drawn fallback tile shows.
    public static func initial(of name: String) -> String {
        guard let first = name.trimmingCharacters(in: .whitespacesAndNewlines).first else { return "" }
        return String(first).uppercased()
    }
}

#if canImport(SwiftUI) && canImport(UIKit)
/// What the header shows after merging a theme's ``ConsentTheme/Brand`` with the bundle.
struct ResolvedIdentity {
    var name: String
    var icon: UIImage?

    /// - Parameters:
    ///   - brand: Explicit name and mark win; `nil` fields come from the bundle.
    ///   - bundle: The host app.
    static func resolve(_ brand: ConsentTheme.Brand, bundle: Bundle = .main) -> ResolvedIdentity {
        let info = bundle.infoDictionary ?? [:]
        let name = brand.name ?? HostIdentity.displayName(bundle: bundle, fallback: ProcessInfo.processInfo.processName)
        if let mark = brand.markImageName {
            // A named mark that is missing shows the initial rather than a silently substituted icon.
            return ResolvedIdentity(name: name, icon: UIImage(named: mark, in: bundle, with: nil) ?? UIImage(named: mark))
        }
        let icon = HostIdentity.iconImageNames(infoDictionary: info).lazy
            .compactMap { UIImage(named: $0, in: bundle, with: nil) }.first
        return ResolvedIdentity(name: name, icon: icon)
    }
}

/// The app's mark and name above the headline. The mark is decorative; the name is read once.
struct IdentityHeader: View {
    let identity: ResolvedIdentity
    @Environment(\.consentTheme) private var theme
    @ScaledMetric(relativeTo: .largeTitle) private var markSize: CGFloat = 56

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            tile.accessibilityHidden(true)
            Text(identity.name.uppercased()).font(.footnote.weight(.semibold)).tracking(1.4)
                .foregroundStyle(theme.colors.accent.color)
                .accessibilityLabel(identity.name).accessibilityIdentifier("c15t.first-layer.brand")
        }
    }

    private var shape: RoundedRectangle {
        // The iOS icon mask is close to a 22% continuous corner.
        RoundedRectangle(cornerRadius: markSize * 0.22, style: .continuous)
    }

    @ViewBuilder private var tile: some View {
        if let icon = identity.icon {
            Image(uiImage: icon).resizable().scaledToFill().frame(width: markSize, height: markSize)
                .clipShape(shape).overlay(shape.strokeBorder(.black.opacity(0.08)))
        } else {
            ZStack {
                shape.fill(theme.colors.accent.color.opacity(0.12))
                Text(HostIdentity.initial(of: identity.name))
                    .font(theme.headlineFont.font(.title, weight: .semibold))
                    .foregroundStyle(theme.colors.accent.color)
            }.frame(width: markSize, height: markSize)
        }
    }
}
#endif
