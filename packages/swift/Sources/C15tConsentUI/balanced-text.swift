import Foundation

/// The narrowest width at which text still takes the same number of lines it takes at `width`.
///
/// Wrapping a headline at that width breaks it near its middle instead of leaving one word on
/// the last line. Nothing about the text is inspected: the caller supplies the height the text
/// takes at a given width, so the result follows the real font, size and locale.
/// - Parameters:
///   - width: The width the text may use.
///   - height: The rendered height of the text when proposed a width. Must not decrease as the
///     width shrinks.
/// - Returns: A width in `0...width`, within a point of the narrowest that keeps the line count.
func balancedTextWidth(within width: CGFloat, height: (CGFloat) -> CGFloat) -> CGFloat {
    guard width.isFinite, width > 0 else { return width }
    let lines = height(width)
    var low: CGFloat = 0, high = width
    while high - low > 1 {
        let middle = (low + high) / 2
        if height(middle) <= lines { high = middle } else { low = middle }
    }
    return high
}

#if canImport(SwiftUI)
import SwiftUI

/// Lays out one text at its balanced width, left-aligned in the full width it was offered.
struct BalancedTextLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let text = subviews.first else { return .zero }
        guard let width = proposal.width else { return text.sizeThatFits(proposal) }
        let full = text.sizeThatFits(ProposedViewSize(width: width, height: nil))
        return CGSize(width: width, height: full.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let text = subviews.first else { return }
        let width = balancedTextWidth(within: bounds.width) { text.sizeThatFits(ProposedViewSize(width: $0, height: nil)).height }
        text.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: width, height: bounds.height))
    }
}
#endif
