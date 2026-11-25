import Foundation

/// A matched policy rule's `surface`: where its consent prompt sits and whether it may block.
///
/// `PolicySurface` in `packages/sdk/schema/src/shared/policy/policy-surface.ts`. The policy
/// reader keeps it in canonical form, as `canonicalizePolicySurface` does on the web: the
/// container's position, edge or side is filled in, an edge style beside a card is dropped, a
/// blocking constraint the rule already implies is dropped, and a surface with nothing left in
/// it is no surface at all. A rule without one reads exactly as it did before `surface` existed.
///
/// `container` and `edgeStyle` are defaults a host presentation overrides. `blocking` is a hard
/// constraint. None of it changes what is allowed: `surface` stays out of the policy, choice and
/// notice fingerprints.
public struct PolicySurface: Sendable, Equatable, Codable {
    /// Where a card sits. `start` and `end` follow the writing direction.
    public enum CardPosition: String, Sendable, Codable, CaseIterable {
        case start, end, center
    }

    /// The edge a banner occupies.
    public enum BannerEdge: String, Sendable, Codable, CaseIterable {
        case bottom, top
    }

    /// The side a drawer slides in from. `start` and `end` follow the writing direction.
    public enum DrawerSide: String, Sendable, Codable, CaseIterable {
        case bottom, top, start, end
    }

    /// The container a prompt renders in.
    public enum Container: Sendable, Equatable, Codable {
        case card(CardPosition)
        case banner(BannerEdge)
        case drawer(DrawerSide)

        private enum CodingKeys: String, CodingKey { case type, position, edge, side }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            switch try container.decode(String.self, forKey: .type) {
            case "card": self = .card(try container.decode(CardPosition.self, forKey: .position))
            case "banner": self = .banner(try container.decode(BannerEdge.self, forKey: .edge))
            case "drawer": self = .drawer(try container.decode(DrawerSide.self, forKey: .side))
            case let other:
                throw DecodingError.dataCorruptedError(
                    forKey: .type, in: container, debugDescription: "container type \"\(other)\" is not supported")
            }
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case let .card(position):
                try container.encode("card", forKey: .type)
                try container.encode(position, forKey: .position)
            case let .banner(edge):
                try container.encode("banner", forKey: .type)
                try container.encode(edge, forKey: .edge)
            case let .drawer(side):
                try container.encode("drawer", forKey: .type)
                try container.encode(side, forKey: .side)
            }
        }
    }

    /// `inset` floats the prompt off the edges with rounded corners; `flush` runs it edge to edge.
    public enum EdgeStyle: String, Sendable, Codable, CaseIterable {
        case inset, flush
    }

    /// The policy's constraint on blocking the app until a choice is made.
    public enum Blocking: String, Sendable, Codable, CaseIterable {
        case forbidden, allowed, required
    }

    public let container: Container?
    public let edgeStyle: EdgeStyle?
    public let blocking: Blocking?

    public init(container: Container? = nil, edgeStyle: EdgeStyle? = nil, blocking: Blocking? = nil) {
        self.container = container
        self.edgeStyle = edgeStyle
        self.blocking = blocking
    }

    /// Whether a rule can block at all: only a choice prompt outside the opt-out model has
    /// something to block for. `canPolicyBlock` in `@inth/sdk-schema`.
    static func canBlock(model: ConsentModel, prompt: PolicyPrompt) -> Bool {
        prompt == .choice && model != .optOut
    }

    /// This surface in canonical form for a rule, or `nil` when nothing is left in it.
    /// `canonicalizePolicySurface` in `@inth/sdk-schema`. The container already carries its
    /// default position, edge or side, because the reader fills it in.
    func canonical(model: ConsentModel, prompt: PolicyPrompt) -> PolicySurface? {
        let isCard: Bool = { if case .card = container { return true } else { return false } }()
        let edgeStyle = isCard ? nil : self.edgeStyle
        let implied: Blocking = Self.canBlock(model: model, prompt: prompt) ? .allowed : .forbidden
        let blocking = self.blocking.flatMap { $0 == .allowed || $0 == implied ? nil : $0 }
        guard container != nil || edgeStyle != nil || blocking != nil else { return nil }
        return PolicySurface(container: container, edgeStyle: edgeStyle, blocking: blocking)
    }
}

/// The layout a policy's ``PolicySurface`` resolves to when the host sets no presentation.
///
/// `resolveLayout` in `packages/sdk/core/src/libs/consent-layout.model.ts`, with only the policy's
/// container, edge style and blocking constraint as input, which is what the web passes it for an
/// install with no host presentation. The snapshot carries the `phone` layout.
///
/// The stock native presenters do not draw it yet: every native first layer is a modal screen
/// chosen by ``ConsentTheme/FirstLayer``. It is here so a host, or a custom presenter, can honour
/// the policy, and so a policy that forbids blocking is visible to the app.
public struct PolicyLayout: Sendable, Equatable, Codable {
    /// The container type.
    public enum ContainerType: String, Sendable, Codable {
        case card, banner, drawer
    }

    /// Every resolved placement.
    public enum Placement: String, Sendable, Codable {
        case cardStart = "card-start"
        case cardEnd = "card-end"
        case cardCenter = "card-center"
        case bannerBottom = "banner-bottom"
        case bannerTop = "banner-top"
        case drawerBottom = "drawer-bottom"
        case drawerTop = "drawer-top"
        case drawerStart = "drawer-start"
        case drawerEnd = "drawer-end"
    }

    /// `expandInPlace` shows a summary first and opens the choices in the same surface;
    /// `allInOne` shows the choices from the start.
    public enum Flow: String, Sendable, Codable {
        case expandInPlace = "expand-in-place"
        case allInOne = "all-in-one"
    }

    /// The viewport class a layout is resolved for. The web switches to `phone` at 640 CSS pixels.
    public enum Viewport: String, Sendable {
        case desktop, phone
    }

    public let type: ContainerType
    public let placement: Placement
    public let flow: Flow
    /// Whether the prompt blocks the app until a choice is made.
    public let blocking: Bool
    public let edgeStyle: PolicySurface.EdgeStyle

    public init(
        type: ContainerType, placement: Placement, flow: Flow, blocking: Bool, edgeStyle: PolicySurface.EdgeStyle
    ) {
        self.type = type
        self.placement = placement
        self.flow = flow
        self.blocking = blocking
        self.edgeStyle = edgeStyle
    }

    /// Resolve a canonical surface for a rule, with no host presentation.
    ///
    /// - A centred card always blocks. Where the rule cannot block, it moves to the `start` corner.
    /// - Blocking applies when the card is centred or the policy requires it, and only for a choice
    ///   prompt outside the opt-out model. A `forbidden` constraint always wins.
    /// - On a phone, `start` and `end` drawers become a bottom drawer that expands in place.
    /// - A card is always inset; the policy's edge style applies to banners and drawers.
    public static func resolve(
        _ surface: PolicySurface, model: ConsentModel, prompt: PolicyPrompt, viewport: Viewport = .phone
    ) -> PolicyLayout {
        let constraint = surface.blocking ?? .allowed
        let blockable = constraint != .forbidden && PolicySurface.canBlock(model: model, prompt: prompt)
        var container = surface.container ?? .card(.start)
        if case .card(.center) = container, !blockable { container = .card(.start) }
        if viewport == .phone, case let .drawer(side) = container, side == .start || side == .end {
            container = .drawer(.bottom)
        }
        let centred: Bool = { if case .card(.center) = container { return true } else { return false } }()
        let blocking = (constraint == .required || centred) && blockable
        // `resolvePromptContainer` passes the policy's edge style only beside a container the
        // policy named that is not a card.
        let policyEdgeStyle: PolicySurface.EdgeStyle? = {
            switch surface.container {
            case .banner?, .drawer?: return surface.edgeStyle
            default: return nil
            }
        }()
        switch container {
        case let .card(position):
            return PolicyLayout(
                type: .card, placement: Placement(rawValue: "card-\(position.rawValue)")!,
                flow: .expandInPlace, blocking: blocking, edgeStyle: .inset)
        case let .banner(edge):
            return PolicyLayout(
                type: .banner, placement: Placement(rawValue: "banner-\(edge.rawValue)")!,
                flow: .expandInPlace, blocking: blocking, edgeStyle: policyEdgeStyle ?? .inset)
        case let .drawer(side):
            return PolicyLayout(
                type: .drawer, placement: Placement(rawValue: "drawer-\(side.rawValue)")!,
                flow: side == .start || side == .end ? .allInOne : .expandInPlace,
                blocking: blocking, edgeStyle: policyEdgeStyle ?? .inset)
        }
    }
}
