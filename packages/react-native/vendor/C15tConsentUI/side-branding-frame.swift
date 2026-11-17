import Foundation

/// Physical window coordinates, shared by the safe area, Customize anchor and reserved regions.
enum SideBrandingFrame {
    static func resolve(canvas: CGRect, content: CGRect, anchor: CGRect, size: CGSize,
                        onLeft: Bool, reserved: [CGRect]) -> CGRect? {
        guard size.width > 0, size.height > 0 else { return nil }
        let strip = onLeft
            ? CGRect(x: canvas.minX, y: content.minY,
                     width: max(0, content.minX - canvas.minX), height: content.height)
            : CGRect(x: content.maxX, y: content.minY,
                     width: max(0, canvas.maxX - content.maxX), height: content.height)
        // CGRect.insetBy can standardize a negative width back into a nonempty rectangle.
        guard strip.width >= size.width + 16, strip.height >= size.height + 16 else { return nil }
        let candidate = CGRect(x: strip.midX - size.width / 2, y: anchor.midY - size.height / 2,
                               width: size.width, height: size.height)
        guard canvas.contains(candidate), strip.insetBy(dx: 8, dy: 8).contains(candidate),
              !reserved.contains(where: { $0.intersects(candidate) }) else { return nil }
        return candidate
    }
}
