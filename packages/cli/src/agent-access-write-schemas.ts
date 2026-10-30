import type { InputSchema } from "./write-input.ts";

// Public API v2 write contracts, including refinements from the shared input codecs.
export const WRITE_SCHEMAS: InputSchema[] = [
  {},
  {
    never: true,
  },
  {
    additional: 1,
    properties: [
      {
        key: "approvedAuditPolicy",
        schema: 3,
      },
      {
        key: "crawlMode",
        schema: 170,
      },
      {
        key: "includeUrls",
        schema: 171,
      },
      {
        key: "maxDepth",
        schema: 172,
      },
      {
        key: "maxPages",
        schema: 173,
      },
      {
        key: "monitoringEnabled",
        schema: 18,
      },
      {
        key: "origin",
        schema: 174,
      },
      {
        key: "policyUrls",
        schema: 171,
      },
      {
        key: "projectId",
        schema: 7,
      },
      {
        key: "regionProfiles",
        schema: 175,
      },
      {
        key: "scheduleCadence",
        schema: 177,
      },
    ],
    required: [
      "crawlMode",
      "maxDepth",
      "maxPages",
      "monitoringEnabled",
      "origin",
      "policyUrls",
      "projectId",
      "scheduleCadence",
    ],
    type: "object",
  },
  {
    choices: [4, 16],
  },
  {
    additional: 1,
    properties: [
      {
        key: "version",
        schema: 5,
      },
      {
        key: "revision",
        schema: 6,
      },
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "approvedAt",
        schema: 8,
      },
      {
        key: "approvalReference",
        schema: 9,
      },
      {
        key: "cookies",
        schema: 10,
      },
      {
        key: "collections",
        schema: 46,
      },
      {
        key: "storage",
        schema: 67,
      },
      {
        key: "withdrawal",
        schema: 78,
      },
      {
        key: "googleInitialization",
        schema: 81,
      },
      {
        key: "auditExpectations",
        schema: 101,
      },
      {
        key: "selectedActivity",
        schema: 120,
      },
      {
        key: "choiceInterface",
        schema: 124,
      },
      {
        key: "refusalPersistence",
        schema: 127,
      },
      {
        key: "tcf",
        schema: 130,
      },
      {
        key: "usPrivacy",
        schema: 148,
      },
    ],
    required: [
      "version",
      "revision",
      "origin",
      "approvedAt",
      "approvalReference",
      "cookies",
    ],
    type: "object",
  },
  {
    enumJson: ["1"],
    type: "number",
  },
  {
    maxLength: 200,
    minLength: 1,
    type: "string",
  },
  {
    minLength: 1,
    type: "string",
  },
  {
    minLength: 1,
    pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
    type: "string",
  },
  {
    maxLength: 1000,
    minLength: 1,
    type: "string",
  },
  {
    items: 11,
    maxItems: 500,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "name",
        schema: 12,
      },
      {
        key: "ownerHost",
        schema: 13,
      },
      {
        key: "partitionKey",
        schema: 14,
      },
      {
        key: "maxRemainingSeconds",
        schema: 17,
      },
      {
        key: "sessionOnly",
        schema: 18,
      },
      {
        key: "security",
        schema: 19,
      },
      {
        key: "priorConsent",
        schema: 22,
      },
      {
        key: "afterWithdrawal",
        schema: 33,
      },
      {
        key: "afterRefusal",
        schema: 34,
      },
      {
        key: "embeddedDocument",
        schema: 43,
      },
      {
        key: "refreshApproval",
        schema: 45,
      },
    ],
    required: ["name", "ownerHost", "partitionKey"],
    type: "object",
  },
  {
    maxLength: 256,
    minLength: 1,
    type: "string",
  },
  {
    maxLength: 253,
    minLength: 1,
    pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
    type: "string",
  },
  {
    choices: [15, 16],
  },
  {
    maxLength: 2048,
    type: "string",
  },
  {
    type: "null",
  },
  {
    minimum: 0,
    type: "number",
  },
  {
    type: "boolean",
  },
  {
    additional: 1,
    properties: [
      {
        key: "secure",
        schema: 18,
      },
      {
        key: "httpOnly",
        schema: 18,
      },
      {
        key: "sameSite",
        schema: 20,
      },
      {
        key: "domain",
        schema: 13,
      },
      {
        key: "path",
        schema: 21,
      },
      {
        key: "hostOnly",
        schema: 18,
      },
      {
        key: "partitioned",
        schema: 18,
      },
    ],
    type: "object",
  },
  {
    enumJson: ['"Strict"', '"Lax"', '"None"'],
    type: "string",
  },
  {
    maxLength: 1024,
    minLength: 1,
    pattern: "^\\/",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "purpose",
        schema: 23,
      },
      {
        key: "path",
        schema: 21,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "requirement",
        schema: 26,
      },
    ],
    required: ["purpose", "path", "countries", "requirement"],
    type: "object",
  },
  {
    enumJson: ['"advertising"', '"measurement"'],
    type: "string",
  },
  {
    items: 25,
    maxItems: 250,
    minItems: 1,
    type: "array",
  },
  {
    pattern: "^[A-Z]{2}$",
    type: "string",
  },
  {
    choices: [27, 29, 31],
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 28,
      },
    ],
    required: ["kind"],
    type: "object",
  },
  {
    enumJson: ['"required"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 30,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["kind", "reference"],
    type: "object",
  },
  {
    enumJson: ['"exempt"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 32,
      },
    ],
    required: ["kind"],
    type: "object",
  },
  {
    enumJson: ['"unresolved"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "removal",
        schema: 28,
      },
      {
        key: "purposeId",
        schema: 6,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["removal", "purposeId", "reference"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "role",
        schema: 35,
      },
      {
        key: "documentScope",
        schema: 36,
      },
      {
        key: "purposeId",
        schema: 6,
      },
      {
        key: "channels",
        schema: 37,
      },
      {
        key: "transmission",
        schema: 39,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["role", "documentScope", "purposeId", "channels", "reference"],
    type: "object",
  },
  {
    enumJson: ['"identifier"'],
    type: "string",
  },
  {
    enumJson: ['"root"'],
    type: "string",
  },
  {
    items: 38,
    maxItems: 2,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: ['"cookie_read"', '"cookie_header"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 40,
      },
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "method",
        schema: 42,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["kind", "origin", "path", "method", "reference"],
    type: "object",
  },
  {
    enumJson: ['"cookie_header"'],
    type: "string",
  },
  {
    maxLength: 1024,
    minLength: 1,
    pattern: "^\\/(?!\\/)[^?#]*$",
    type: "string",
  },
  {
    enumJson: ['"GET"', '"POST"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "url",
        schema: 7,
      },
      {
        key: "reference",
        schema: 44,
      },
    ],
    required: ["url", "reference"],
    type: "object",
  },
  {
    maxLength: 512,
    minLength: 1,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["reference"],
    type: "object",
  },
  {
    items: 47,
    maxItems: 500,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "vendor",
        schema: 48,
      },
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "method",
        schema: 42,
      },
      {
        key: "initiatorUrl",
        schema: 7,
      },
      {
        key: "purpose",
        schema: 23,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "requirement",
        schema: 26,
      },
      {
        key: "payloadFields",
        schema: 49,
      },
      {
        key: "replayProbe",
        schema: 50,
      },
      {
        key: "embeddedDocument",
        schema: 53,
      },
      {
        key: "identifyingSignal",
        schema: 55,
      },
      {
        key: "afterWithdrawal",
        schema: 57,
      },
      {
        key: "proxyRouting",
        schema: 58,
      },
    ],
    required: [
      "vendor",
      "origin",
      "path",
      "method",
      "initiatorUrl",
      "purpose",
      "countries",
      "requirement",
      "payloadFields",
    ],
    type: "object",
  },
  {
    enumJson: [
      '"google-analytics"',
      '"posthog"',
      '"plausible"',
      '"databuddy"',
      '"linkedin-insight-tag"',
      '"x-pixel"',
      '"custom"',
    ],
    type: "string",
  },
  {
    items: 6,
    maxItems: 100,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "eventType",
        schema: 51,
      },
      {
        key: "markerField",
        schema: 6,
      },
      {
        key: "purposeId",
        schema: 6,
      },
      {
        key: "permittedBehaviour",
        schema: 52,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: [
      "eventType",
      "markerField",
      "purposeId",
      "permittedBehaviour",
      "reference",
    ],
    type: "object",
  },
  {
    pattern: "^inth-audit-[a-z0-9-]{1,80}$",
    type: "string",
  },
  {
    enumJson: ['"discard_denied_events"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "url",
        schema: 7,
      },
      {
        key: "source",
        schema: 54,
      },
      {
        key: "reference",
        schema: 44,
      },
    ],
    required: ["url", "source", "reference"],
    type: "object",
  },
  {
    enumJson: ['"script"', '"parser"', '"document"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 56,
      },
      {
        key: "source",
        schema: 54,
      },
      {
        key: "fields",
        schema: 49,
      },
      {
        key: "reference",
        schema: 44,
      },
    ],
    required: ["kind", "source", "fields", "reference"],
    type: "object",
  },
  {
    enumJson: ['"pixel"', '"fingerprint"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "purposeId",
        schema: 6,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["purposeId", "reference"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 59,
      },
      {
        key: "forwarding",
        schema: 60,
      },
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "revision",
        schema: 6,
      },
      {
        key: "digest",
        schema: 61,
      },
      {
        key: "observedAt",
        schema: 8,
      },
      {
        key: "validUntil",
        schema: 8,
      },
      {
        key: "recipient",
        schema: 62,
      },
      {
        key: "fields",
        schema: 64,
      },
      {
        key: "cnameChain",
        schema: 66,
      },
    ],
    required: [
      "kind",
      "forwarding",
      "reference",
      "revision",
      "digest",
      "observedAt",
      "validUntil",
      "recipient",
      "fields",
    ],
    type: "object",
  },
  {
    enumJson: ['"server_proxy"', '"cname"'],
    type: "string",
  },
  {
    enumJson: ['"unconditional"', '"conditional"'],
    type: "string",
  },
  {
    pattern: "^[a-f0-9]{64}$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "relationship",
        schema: 63,
      },
      {
        key: "method",
        schema: 42,
      },
    ],
    required: ["origin", "path", "relationship", "method"],
    type: "object",
  },
  {
    enumJson: ['"third_party"', '"first_party"', '"unresolved"'],
    type: "string",
  },
  {
    items: 65,
    maxItems: 100,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "source",
        schema: 6,
      },
      {
        key: "destination",
        schema: 6,
      },
    ],
    required: ["source", "destination"],
    type: "object",
  },
  {
    items: 13,
    maxItems: 16,
    minItems: 2,
    type: "array",
  },
  {
    items: 68,
    maxItems: 500,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "mechanism",
        schema: 69,
      },
      {
        key: "accessScope",
        schema: 70,
      },
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "key",
        schema: 71,
      },
      {
        key: "database",
        schema: 72,
      },
      {
        key: "store",
        schema: 72,
      },
      {
        key: "purpose",
        schema: 23,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "requirement",
        schema: 26,
      },
      {
        key: "embeddedDocument",
        schema: 43,
      },
      {
        key: "afterRefusal",
        schema: 73,
      },
    ],
    required: [
      "mechanism",
      "accessScope",
      "origin",
      "key",
      "database",
      "store",
      "purpose",
      "countries",
      "requirement",
    ],
    type: "object",
  },
  {
    enumJson: ['"local"', '"session"', '"indexeddb"', '"cache"'],
    type: "string",
  },
  {
    enumJson: ['"document-native-methods"'],
    type: "string",
  },
  {
    maxLength: 1024,
    minLength: 1,
    type: "string",
  },
  {
    choices: [12, 16],
  },
  {
    additional: 1,
    properties: [
      {
        key: "role",
        schema: 35,
      },
      {
        key: "documentScope",
        schema: 36,
      },
      {
        key: "purposeId",
        schema: 6,
      },
      {
        key: "channels",
        schema: 74,
      },
      {
        key: "transmission",
        schema: 76,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["role", "documentScope", "purposeId", "channels", "reference"],
    type: "object",
  },
  {
    items: 75,
    maxItems: 4,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: [
      '"native_read"',
      '"transmission"',
      '"property_read"',
      '"worker"',
    ],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 77,
      },
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "parameter",
        schema: 6,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["kind", "origin", "path", "parameter", "reference"],
    type: "object",
  },
  {
    enumJson: ['"fetch_get_query"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "route",
        schema: 79,
      },
    ],
    required: ["reference", "countries"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "selector",
        schema: 44,
      },
      {
        key: "label",
        schema: 80,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["reference"],
    type: "object",
  },
  {
    maxLength: 120,
    minLength: 1,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "transport",
        schema: 82,
      },
      {
        key: "dataLayerName",
        schema: 83,
      },
      {
        key: "requiredDefault",
        schema: 84,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "consentTypes",
        schema: 85,
      },
      {
        key: "defaultStates",
        schema: 87,
      },
      {
        key: "choiceStates",
        schema: 91,
      },
      {
        key: "categoryMapping",
        schema: 94,
      },
      {
        key: "adsDataRedaction",
        schema: 98,
      },
      {
        key: "implementationMode",
        schema: 99,
      },
    ],
    required: [
      "reference",
      "transport",
      "dataLayerName",
      "requiredDefault",
      "countries",
      "consentTypes",
    ],
    type: "object",
  },
  {
    enumJson: ['"native_data_layer_push"'],
    type: "string",
  },
  {
    enumJson: ['"dataLayer"'],
    type: "string",
  },
  {
    enumJson: ["true"],
    type: "boolean",
  },
  {
    items: 86,
    maxItems: 4,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: [
      '"ad_storage"',
      '"analytics_storage"',
      '"ad_user_data"',
      '"ad_personalization"',
    ],
    type: "string",
  },
  {
    items: 88,
    maxItems: 7,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "type",
        schema: 89,
      },
      {
        key: "state",
        schema: 90,
      },
    ],
    required: ["type", "state"],
    type: "object",
  },
  {
    enumJson: [
      '"ad_storage"',
      '"analytics_storage"',
      '"ad_user_data"',
      '"ad_personalization"',
      '"functionality_storage"',
      '"personalization_storage"',
      '"security_storage"',
    ],
    type: "string",
  },
  {
    enumJson: ['"denied"', '"granted"'],
    type: "string",
  },
  {
    items: 92,
    maxItems: 5,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "choice",
        schema: 93,
      },
      {
        key: "updateRequired",
        schema: 18,
      },
      {
        key: "states",
        schema: 87,
      },
    ],
    required: ["choice", "updateRequired", "states"],
    type: "object",
  },
  {
    enumJson: [
      '"accept_all"',
      '"reject_all"',
      '"accept_measurement_only"',
      '"accept_functionality_only"',
      '"accept_marketing_only"',
    ],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "categories",
        schema: 95,
      },
    ],
    required: ["reference", "categories"],
    type: "object",
  },
  {
    items: 96,
    maxItems: 32,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "categoryId",
        schema: 6,
      },
      {
        key: "consentTypes",
        schema: 97,
      },
    ],
    required: ["categoryId", "consentTypes"],
    type: "object",
  },
  {
    items: 89,
    maxItems: 7,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "required",
        schema: 84,
      },
    ],
    required: ["reference", "required"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "mode",
        schema: 100,
      },
    ],
    required: ["reference", "mode"],
    type: "object",
  },
  {
    enumJson: ['"basic"', '"advanced"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "regionalBanner",
        schema: 102,
      },
      {
        key: "noticeAtCollection",
        schema: 105,
      },
      {
        key: "consentStorageScope",
        schema: 106,
      },
      {
        key: "statisticalException",
        schema: 108,
      },
      {
        key: "disclosedVendors",
        schema: 110,
      },
      {
        key: "cmpMaintenance",
        schema: 113,
      },
      {
        key: "downstreamAssurance",
        schema: 115,
      },
      {
        key: "instrumentedEvidence",
        schema: 117,
      },
    ],
    type: "object",
  },
  {
    items: 103,
    maxItems: 50,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "banner",
        schema: 104,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["countries", "banner", "reference"],
    type: "object",
  },
  {
    enumJson: ['"required"', '"not_expected"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "notice",
        schema: 79,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["countries", "notice", "reference"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "scope",
        schema: 107,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["scope", "countries", "reference"],
    type: "object",
  },
  {
    enumJson: ['"host_only"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "purposeIds",
        schema: 109,
      },
      {
        key: "notice",
        schema: 79,
      },
      {
        key: "objection",
        schema: 79,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["countries", "purposeIds", "notice", "objection", "reference"],
    type: "object",
  },
  {
    items: 6,
    maxItems: 32,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "vendors",
        schema: 111,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["vendors", "reference"],
    type: "object",
  },
  {
    items: 112,
    maxItems: 500,
    type: "array",
  },
  {
    pattern: "^[a-z0-9][a-z0-9-]{0,99}$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "platform",
        schema: 112,
      },
      {
        key: "minimumVersion",
        schema: 114,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["platform", "minimumVersion", "reference"],
    type: "object",
  },
  {
    pattern: "^\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "recipients",
        schema: 116,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["recipients", "reference"],
    type: "object",
  },
  {
    items: 7,
    maxItems: 100,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "rules",
        schema: 118,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["rules", "reference"],
    type: "object",
  },
  {
    items: 119,
    maxItems: 8,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: [
      '"N06"',
      '"D10"',
      '"D13"',
      '"X01"',
      '"X04"',
      '"X06"',
      '"X07"',
      '"X08"',
    ],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "categories",
        schema: 121,
      },
    ],
    required: ["reference", "countries", "categories"],
    type: "object",
  },
  {
    items: 122,
    maxItems: 50,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "categoryId",
        schema: 6,
      },
      {
        key: "collection",
        schema: 84,
      },
      {
        key: "cookies",
        schema: 123,
      },
    ],
    required: ["categoryId"],
    type: "object",
  },
  {
    items: 12,
    maxItems: 100,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "affirmativeOptIn",
        schema: 84,
      },
      {
        key: "privacyNoticeUrl",
        schema: 125,
      },
      {
        key: "accessibility",
        schema: 126,
      },
      {
        key: "acceptAllOffered",
        schema: 84,
      },
    ],
    required: ["reference", "countries"],
    type: "object",
  },
  {
    maxLength: 2048,
    minLength: 1,
    type: "string",
  },
  {
    enumJson: ['"wcag_2_1_aa"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "scopes",
        schema: 128,
      },
    ],
    required: ["reference", "countries", "scopes"],
    type: "object",
  },
  {
    items: 129,
    maxItems: 2,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: ['"reload"', '"same_session_return"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "countries",
        schema: 24,
      },
      {
        key: "choices",
        schema: 131,
      },
      {
        key: "publisherRestrictions",
        schema: 141,
      },
      {
        key: "consentModeMapping",
        schema: 145,
      },
    ],
    required: ["reference", "countries"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "acceptAll",
        schema: 132,
      },
      {
        key: "rejectAll",
        schema: 139,
      },
    ],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "purposeConsents",
        schema: 133,
      },
      {
        key: "vendorConsents",
        schema: 135,
      },
      {
        key: "specialFeatureOptins",
        schema: 137,
      },
    ],
    required: ["purposeConsents", "vendorConsents", "specialFeatureOptins"],
    type: "object",
  },
  {
    items: 134,
    maxItems: 24,
    minItems: 1,
    type: "array",
  },
  {
    maximum: 24,
    minimum: 1,
    type: "integer",
  },
  {
    items: 136,
    maxItems: 65_535,
    type: "array",
  },
  {
    maximum: 65_535,
    minimum: 1,
    type: "integer",
  },
  {
    items: 138,
    maxItems: 12,
    type: "array",
  },
  {
    maximum: 12,
    minimum: 1,
    type: "integer",
  },
  {
    additional: 1,
    properties: [
      {
        key: "allowedPurposeConsents",
        schema: 140,
      },
      {
        key: "allowedVendorConsents",
        schema: 135,
      },
      {
        key: "allowedSpecialFeatureOptins",
        schema: 137,
      },
    ],
    required: [
      "allowedPurposeConsents",
      "allowedVendorConsents",
      "allowedSpecialFeatureOptins",
    ],
    type: "object",
  },
  {
    items: 134,
    maxItems: 24,
    type: "array",
  },
  {
    items: 142,
    maxItems: 64,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "purposeId",
        schema: 134,
      },
      {
        key: "restrictionType",
        schema: 143,
      },
      {
        key: "vendorIds",
        schema: 144,
      },
    ],
    required: ["purposeId", "restrictionType", "vendorIds"],
    type: "object",
  },
  {
    enumJson: ["0", "1", "2"],
    type: "number",
  },
  {
    items: 136,
    maxItems: 65_535,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "transport",
        schema: 82,
      },
      {
        key: "dataLayerName",
        schema: 83,
      },
      {
        key: "types",
        schema: 146,
      },
    ],
    required: ["reference", "transport", "dataLayerName", "types"],
    type: "object",
  },
  {
    items: 147,
    maxItems: 4,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "type",
        schema: 89,
      },
      {
        key: "purposeConsents",
        schema: 133,
      },
    ],
    required: ["type", "purposeConsents"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "reference",
        schema: 9,
      },
      {
        key: "subdivisions",
        schema: 149,
      },
      {
        key: "optOutChoice",
        schema: 151,
      },
      {
        key: "gpp",
        schema: 152,
      },
      {
        key: "usp",
        schema: 158,
      },
      {
        key: "saleSharing",
        schema: 159,
      },
      {
        key: "optOutRoute",
        schema: 163,
      },
    ],
    required: ["reference", "subdivisions"],
    type: "object",
  },
  {
    items: 150,
    maxItems: 60,
    minItems: 1,
    type: "array",
  },
  {
    pattern: "^US-[A-Z]{2}$",
    type: "string",
  },
  {
    enumJson: ['"saved_rejection"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "sections",
        schema: 153,
      },
      {
        key: "optOutFields",
        schema: 156,
      },
    ],
    required: ["sections", "optOutFields"],
    type: "object",
  },
  {
    items: 154,
    maxItems: 6,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "api",
        schema: 155,
      },
      {
        key: "subdivisions",
        schema: 149,
      },
    ],
    required: ["api", "subdivisions"],
    type: "object",
  },
  {
    enumJson: ['"usnat"', '"usca"', '"usva"', '"usco"', '"usut"', '"usct"'],
    type: "string",
  },
  {
    items: 157,
    maxItems: 3,
    minItems: 1,
    type: "array",
  },
  {
    enumJson: [
      '"SaleOptOut"',
      '"SharingOptOut"',
      '"TargetedAdvertisingOptOut"',
    ],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "optOutFlag",
        schema: 28,
      },
    ],
    required: ["optOutFlag"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "transports",
        schema: 160,
      },
    ],
    required: ["transports"],
    type: "object",
  },
  {
    items: 161,
    maxItems: 100,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "origin",
        schema: 7,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "method",
        schema: 42,
      },
      {
        key: "activity",
        schema: 162,
      },
      {
        key: "reference",
        schema: 9,
      },
    ],
    required: ["origin", "path", "method", "activity", "reference"],
    type: "object",
  },
  {
    enumJson: ['"sale"', '"sharing"', '"targeted_advertising"'],
    type: "string",
  },
  {
    choices: [164, 168],
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 165,
      },
      {
        key: "label",
        schema: 166,
      },
      {
        key: "pages",
        schema: 167,
      },
    ],
    required: ["kind", "label"],
    type: "object",
  },
  {
    enumJson: ['"consent_manager"'],
    type: "string",
  },
  {
    enumJson: [
      '"Do Not Sell or Share My Personal Information"',
      '"Do Not Sell My Personal Information"',
      '"Do Not Share My Personal Information"',
      '"Your Privacy Choices"',
      '"Your California Privacy Choices"',
    ],
    type: "string",
  },
  {
    items: 41,
    maxItems: 50,
    minItems: 1,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "kind",
        schema: 169,
      },
      {
        key: "label",
        schema: 166,
      },
      {
        key: "path",
        schema: 41,
      },
      {
        key: "pages",
        schema: 167,
      },
    ],
    required: ["kind", "label", "path"],
    type: "object",
  },
  {
    enumJson: ['"page"'],
    type: "string",
  },
  {
    enumJson: ['"mixed"', '"domain"', '"sitemap"', '"explicit_urls"'],
    type: "string",
  },
  {
    items: 7,
    type: "array",
  },
  {
    minimum: 0,
    type: "integer",
  },
  {
    exclusiveMinimum: 0,
    type: "integer",
  },
  {
    format: "website-origin",
    minLength: 1,
    type: "string",
  },
  {
    items: 176,
    type: "array",
  },
  {
    enumJson: [
      '"uk_gdpr"',
      '"eu_eea_gdpr"',
      '"us_ca_cpra"',
      '"us_tx_baseline"',
      '"custom"',
    ],
    type: "string",
  },
  {
    enumJson: ['"hourly"', '"daily"', '"weekly"', '"biweekly"', '"monthly"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "approvedAuditPolicy",
        schema: 3,
      },
      {
        key: "crawlMode",
        schema: 170,
      },
      {
        key: "includeUrls",
        schema: 171,
      },
      {
        key: "maxDepth",
        schema: 172,
      },
      {
        key: "maxPages",
        schema: 173,
      },
      {
        key: "monitoringEnabled",
        schema: 18,
      },
      {
        key: "origin",
        schema: 174,
      },
      {
        key: "policyUrls",
        schema: 171,
      },
      {
        key: "projectId",
        schema: 7,
      },
      {
        key: "regionProfiles",
        schema: 175,
      },
      {
        key: "scheduleCadence",
        schema: 177,
      },
      {
        key: "enabled",
        schema: 18,
      },
    ],
    required: [
      "crawlMode",
      "maxDepth",
      "maxPages",
      "monitoringEnabled",
      "origin",
      "policyUrls",
      "projectId",
      "scheduleCadence",
      "enabled",
    ],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "i18n",
        schema: 180,
      },
    ],
    required: ["i18n"],
    type: "object",
  },
  {
    choices: [181, 16],
  },
  {
    additional: 1,
    properties: [
      {
        key: "defaultProfile",
        schema: 182,
      },
      {
        key: "messages",
        schema: 183,
      },
    ],
    type: "object",
  },
  {
    maxLength: 128,
    type: "string",
  },
  {
    additional: 184,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "fallbackLanguage",
        schema: 185,
      },
      {
        key: "translations",
        schema: 186,
      },
    ],
    required: ["translations"],
    type: "object",
  },
  {
    maxLength: 32,
    type: "string",
  },
  {
    additional: 187,
    keyMax: 32,
    type: "object",
  },
  {
    choices: [188, 189],
  },
  {
    maxLength: 20_000,
    type: "string",
  },
  {
    additional: 190,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 191],
  },
  {
    additional: 192,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 193],
  },
  {
    additional: 194,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 195],
  },
  {
    additional: 196,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 197],
  },
  {
    additional: 198,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 199],
  },
  {
    additional: 200,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 201],
  },
  {
    additional: 202,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 203],
  },
  {
    additional: 204,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 205],
  },
  {
    additional: 206,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 207],
  },
  {
    additional: 208,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 209],
  },
  {
    additional: 210,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 211],
  },
  {
    additional: 212,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 213],
  },
  {
    additional: 214,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 215],
  },
  {
    additional: 216,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 217],
  },
  {
    additional: 218,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 219],
  },
  {
    additional: 220,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 221],
  },
  {
    additional: 222,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 223],
  },
  {
    additional: 224,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 225],
  },
  {
    additional: 226,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [188, 227],
  },
  {
    additional: 188,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "policies",
        schema: 229,
      },
    ],
    required: ["policies"],
    type: "object",
  },
  {
    items: 230,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "review",
        schema: 231,
      },
      {
        key: "legacyMaterial",
        schema: 231,
      },
      {
        key: "model",
        schema: 236,
      },
      {
        key: "prompt",
        schema: 237,
      },
      {
        key: "categories",
        schema: 238,
      },
      {
        key: "scopeMode",
        schema: 239,
      },
      {
        key: "preselectedCategories",
        schema: 238,
      },
      {
        key: "actions",
        schema: 240,
      },
      {
        key: "rights",
        schema: 242,
      },
      {
        key: "validity",
        schema: 231,
      },
      {
        key: "privacySignals",
        schema: 231,
      },
      {
        key: "copyRevision",
        schema: 233,
      },
      {
        key: "consent",
        schema: 231,
      },
      {
        key: "id",
        schema: 244,
      },
      {
        key: "i18n",
        schema: 231,
      },
      {
        key: "match",
        schema: 245,
      },
      {
        key: "proof",
        schema: 231,
      },
      {
        key: "ui",
        schema: 231,
      },
    ],
    required: ["id", "match"],
    type: "object",
  },
  {
    choices: [18, 232, 233, 16, 234, 235],
  },
  {
    type: "number",
  },
  {
    type: "string",
  },
  {
    items: 231,
    type: "array",
  },
  {
    additional: 231,
    type: "object",
  },
  {
    enumJson: ['"opt-in"', '"opt-out"', '"none"', '"iab"'],
    type: "string",
  },
  {
    enumJson: ['"choice"', '"notice"', '"none"'],
    type: "string",
  },
  {
    items: 233,
    type: "array",
  },
  {
    enumJson: ['"strict"', '"permissive"'],
    type: "string",
  },
  {
    items: 241,
    type: "array",
  },
  {
    enumJson: ['"accept"', '"reject"', '"customize"'],
    type: "string",
  },
  {
    items: 243,
    type: "array",
  },
  {
    enumJson: ['"disclosure"', '"preferences"', '"opt-out"'],
    type: "string",
  },
  {
    maxLength: 128,
    minLength: 1,
    trim: true,
    type: "string",
  },
  {
    additional: 231,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "expectedInstanceId",
        schema: 247,
      },
      {
        key: "expectedBackendVersion",
        schema: 248,
      },
    ],
    required: ["expectedInstanceId", "expectedBackendVersion"],
    type: "object",
  },
  {
    maxLength: 255,
    minLength: 1,
    pattern: "^[A-Za-z0-9_-]+$",
    type: "string",
  },
  {
    maxLength: 128,
    minLength: 1,
    pattern: "^\\S+$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "name",
        schema: 250,
      },
    ],
    required: ["name"],
    type: "object",
  },
  {
    maxLength: 128,
    minLength: 1,
    pattern: "^[^\\p{Cc}\\p{Cf}]+$",
    trim: true,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "overlapSeconds",
        schema: 252,
      },
    ],
    required: ["overlapSeconds"],
    type: "object",
  },
  {
    maximum: 86_400,
    minimum: 0,
    type: "integer",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 254,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    choices: [255, 259],
  },
  {
    additional: 1,
    properties: [
      {
        key: "checkoutAttemptId",
        schema: 256,
      },
      {
        key: "promotionCode",
        schema: 233,
      },
      {
        key: "plan",
        schema: 257,
      },
      {
        key: "product",
        schema: 258,
      },
    ],
    required: ["checkoutAttemptId", "plan", "product"],
    type: "object",
  },
  {
    format: "uuid",
    pattern:
      "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$",
    type: "string",
  },
  {
    enumJson: [
      '"free"',
      '"starter"',
      '"starter_annual"',
      '"pro"',
      '"pro_annual"',
      '"business"',
      '"business_annual"',
      '"startup"',
      '"startup_annual"',
    ],
    type: "string",
  },
  {
    enumJson: ['"inth"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "billingInterval",
        schema: 260,
      },
      {
        key: "checkoutAttemptId",
        schema: 256,
      },
      {
        key: "plan",
        schema: 261,
      },
      {
        key: "product",
        schema: 262,
      },
      {
        key: "promotionCode",
        schema: 233,
      },
    ],
    required: ["billingInterval", "checkoutAttemptId", "plan", "product"],
    type: "object",
  },
  {
    enumJson: ['"month"', '"year"'],
    type: "string",
  },
  {
    enumJson: ['"hobby"', '"starter"', '"pro"'],
    type: "string",
  },
  {
    enumJson: ['"consent"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 254,
      },
      {
        key: "approvedQuote",
        schema: 264,
      },
    ],
    required: ["input", "approvedQuote"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "currency",
        schema: 265,
      },
      {
        key: "discount",
        schema: 266,
      },
      {
        key: "lineItems",
        schema: 269,
      },
      {
        key: "nextCycle",
        schema: 272,
      },
      {
        key: "subtotal",
        schema: 271,
      },
      {
        key: "total",
        schema: 172,
      },
    ],
    required: ["currency", "lineItems", "nextCycle", "subtotal", "total"],
    type: "object",
  },
  {
    maxLength: 3,
    minLength: 3,
    pattern: "^[a-zA-Z]{3}$",
    type: "string",
  },
  {
    choices: [267, 16],
  },
  {
    additional: 1,
    properties: [
      {
        key: "amount",
        schema: 172,
      },
      {
        key: "label",
        schema: 268,
      },
    ],
    required: ["amount", "label"],
    type: "object",
  },
  {
    choices: [233, 16],
  },
  {
    items: 270,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "amount",
        schema: 271,
      },
      {
        key: "description",
        schema: 268,
      },
      {
        key: "label",
        schema: 233,
      },
    ],
    required: ["amount", "description", "label"],
    type: "object",
  },
  {
    type: "integer",
  },
  {
    choices: [273, 16],
  },
  {
    additional: 1,
    properties: [
      {
        key: "startsAt",
        schema: 274,
      },
      {
        key: "total",
        schema: 172,
      },
    ],
    required: ["startsAt", "total"],
    type: "object",
  },
  {
    format: "date-time",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 276,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "checkoutAttemptId",
        schema: 256,
      },
      {
        key: "catalogVersion",
        schema: 173,
      },
      {
        key: "credits",
        schema: 173,
      },
    ],
    required: ["checkoutAttemptId", "catalogVersion", "credits"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 276,
      },
      {
        key: "approvedQuote",
        schema: 264,
      },
    ],
    required: ["input", "approvedQuote"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 279,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    choices: [280, 281],
  },
  {
    additional: 1,
    properties: [
      {
        key: "catalogVersion",
        schema: 173,
      },
      {
        key: "enabled",
        schema: 84,
      },
      {
        key: "monthlyPurchaseLimit",
        schema: 173,
      },
      {
        key: "quantityCredits",
        schema: 173,
      },
      {
        key: "requestId",
        schema: 256,
      },
      {
        key: "thresholdCredits",
        schema: 173,
      },
    ],
    required: [
      "catalogVersion",
      "enabled",
      "monthlyPurchaseLimit",
      "quantityCredits",
      "requestId",
      "thresholdCredits",
    ],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "enabled",
        schema: 282,
      },
      {
        key: "requestId",
        schema: 256,
      },
    ],
    required: ["enabled", "requestId"],
    type: "object",
  },
  {
    enumJson: ["false"],
    type: "boolean",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 284,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "address",
        schema: 285,
      },
      {
        key: "businessName",
        schema: 291,
      },
    ],
    required: ["address", "businessName"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "city",
        schema: 286,
      },
      {
        key: "country",
        schema: 288,
      },
      {
        key: "line1",
        schema: 289,
      },
      {
        key: "line2",
        schema: 286,
      },
      {
        key: "postalCode",
        schema: 290,
      },
      {
        key: "state",
        schema: 286,
      },
    ],
    required: ["city", "country", "line1", "line2", "postalCode", "state"],
    type: "object",
  },
  {
    choices: [287, 16],
  },
  {
    maxLength: 255,
    type: "string",
  },
  {
    pattern: "^[A-Z]{2}$",
    type: "string",
  },
  {
    maxLength: 255,
    pattern: "\\S",
    type: "string",
  },
  {
    choices: [185, 16],
  },
  {
    maxLength: 150,
    pattern: "\\S",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 293,
      },
      {
        key: "confirmCancellation",
        schema: 84,
      },
    ],
    required: ["input", "confirmCancellation"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "product",
        schema: 294,
      },
      {
        key: "requestId",
        schema: 256,
      },
    ],
    required: ["product", "requestId"],
    type: "object",
  },
  {
    enumJson: ['"consent"', '"inth"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "input",
        schema: 293,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "paymentMethodId",
        schema: 297,
      },
    ],
    required: ["paymentMethodId"],
    type: "object",
  },
  {
    maxLength: 255,
    minLength: 1,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
      {
        key: "paymentMethodId",
        schema: 297,
      },
      {
        key: "confirmPaymentMethodId",
        schema: 297,
      },
    ],
    required: ["paymentMethodId", "confirmPaymentMethodId"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 7,
      },
    ],
    type: "object",
  },
  {
    choices: [301],
  },
  {
    additional: 1,
    properties: [
      {
        key: "clientMessageId",
        schema: 302,
      },
      {
        key: "text",
        schema: 233,
      },
      {
        key: "attachmentIds",
        schema: 303,
      },
    ],
    required: ["clientMessageId", "text"],
    type: "object",
  },
  {
    format: "uuid",
    pattern:
      "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$",
    type: "string",
  },
  {
    choices: [304, 16],
  },
  {
    items: 305,
    maxItems: 5,
    type: "array",
  },
  {
    maxLength: 64,
    pattern: "^sat_[1-9a-km-z]+$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "clientMessageId",
        schema: 302,
      },
      {
        key: "text",
        schema: 233,
      },
      {
        key: "attachmentIds",
        schema: 303,
      },
    ],
    required: ["clientMessageId", "text"],
    type: "object",
  },
  {
    additional: 1,
    type: "object",
  },
  {
    additional: 1,
    minProperties: 1,
    properties: [
      {
        key: "hidePII",
        schema: 18,
      },
      {
        key: "name",
        schema: 309,
      },
    ],
    type: "object",
  },
  {
    maxLength: 255,
    minLength: 1,
    trim: true,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "confirmation",
        schema: 311,
      },
    ],
    required: ["confirmation"],
    type: "object",
  },
  {
    maxLength: 320,
    minLength: 1,
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "scope",
        schema: 313,
      },
      {
        key: "family",
        schema: 314,
      },
      {
        key: "enabled",
        schema: 18,
      },
      {
        key: "mode",
        schema: 315,
      },
    ],
    required: ["scope", "family", "enabled", "mode"],
    type: "object",
  },
  {
    enumJson: ['"account"', '"organization"'],
    type: "string",
  },
  {
    enumJson: [
      '"welcome"',
      '"upsell"',
      '"spike-protection"',
      '"banner-recording"',
      '"consent-rate-shift"',
      '"banner-change-published"',
      '"first-week-recap"',
      '"unconfigured-region"',
      '"missing-translation"',
    ],
    type: "string",
  },
  {
    enumJson: ['"immediate"', '"daily"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "role",
        schema: 317,
      },
      {
        key: "configured",
        schema: 18,
      },
      {
        key: "userIds",
        schema: 318,
      },
    ],
    required: ["role", "configured", "userIds"],
    type: "object",
  },
  {
    enumJson: ['"engineering"', '"compliance"', '"legal"'],
    type: "string",
  },
  {
    items: 297,
    maxItems: 500,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "name",
        schema: 337,
      },
    ],
    required: ["name"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "newSlug",
        schema: 321,
      },
      {
        key: "expectedSlug",
        schema: 321,
      },
    ],
    required: ["newSlug", "expectedSlug"],
    type: "object",
  },
  {
    maxLength: 20,
    minLength: 3,
    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "confirmation",
        schema: 297,
      },
    ],
    required: ["confirmation"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "mutationId",
        schema: 309,
      },
      {
        key: "expectedVersion",
        schema: 324,
      },
      {
        key: "providerRetention",
        schema: 325,
      },
    ],
    required: ["mutationId", "expectedVersion", "providerRetention"],
    type: "object",
  },
  {
    maximum: 9_007_199_254_740_991,
    minimum: 0,
    type: "integer",
  },
  {
    enumJson: ['"standard"', '"strict-zdr"'],
    type: "string",
  },
  {
    additional: 1,
    type: "object",
  },
  {
    additional: 1,
    minProperties: 1,
    properties: [
      {
        key: "branchFilters",
        schema: 328,
      },
      {
        key: "ignoredPaths",
        schema: 328,
      },
    ],
    type: "object",
  },
  {
    items: 338,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "enabled",
        schema: 18,
      },
      {
        key: "branchFilters",
        schema: 328,
      },
    ],
    required: ["enabled"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "projectId",
        schema: 297,
      },
    ],
    required: ["projectId"],
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "mode",
        schema: 332,
      },
      {
        key: "confirmation",
        schema: 333,
      },
    ],
    required: ["mode"],
    type: "object",
  },
  {
    enumJson: ['"all"', '"others"'],
    type: "string",
  },
  {
    enumJson: ['"revoke-all-browser-sessions"'],
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "organizationId",
        schema: 297,
      },
      {
        key: "quoteId",
        schema: 297,
      },
      {
        key: "candidatePlanChecksum",
        schema: 71,
      },
      {
        key: "maxCredits",
        schema: 324,
      },
      {
        key: "requestId",
        schema: 335,
      },
    ],
    required: ["quoteId", "candidatePlanChecksum", "maxCredits", "requestId"],
    type: "object",
  },
  {
    pattern:
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    type: "string",
  },
  {
    additional: 1,
    properties: [
      {
        key: "currency",
        schema: 265,
      },
      {
        key: "discount",
        schema: 266,
      },
      {
        key: "lineItems",
        schema: 269,
      },
      {
        key: "nextCycle",
        schema: 272,
      },
      {
        key: "subtotal",
        schema: 271,
      },
      {
        key: "total",
        schema: 172,
      },
    ],
    required: ["currency", "lineItems", "nextCycle", "subtotal", "total"],
    type: "object",
  },
  {
    maxLength: 255,
    minLength: 2,
    trim: true,
    type: "string",
  },
  {
    maxLength: 1024,
    minLength: 1,
    trim: true,
    type: "string",
  },
];

export const WRITE_SCHEMA_NAMES: { name: string; schema: number }[] = [
  {
    name: "WebsiteTargetCreate",
    schema: 2,
  },
  {
    name: "WebsiteTargetUpdate",
    schema: 178,
  },
  {
    name: "ProjectConsentI18nUpdate",
    schema: 179,
  },
  {
    name: "ProjectConsentPoliciesUpdate",
    schema: 228,
  },
  {
    name: "ProjectConsentLifecycleMutation",
    schema: 246,
  },
  {
    name: "ProjectConsentRuntimeKeyCreate",
    schema: 249,
  },
  {
    name: "ProjectConsentRuntimeKeyRotate",
    schema: 251,
  },
  {
    name: "BillingPlanPreviewInput",
    schema: 253,
  },
  {
    name: "BillingPlanChangeInput",
    schema: 263,
  },
  {
    name: "BillingCreditPreviewInput",
    schema: 275,
  },
  {
    name: "BillingCreditPurchaseInput",
    schema: 277,
  },
  {
    name: "BillingAutoTopUpInput",
    schema: 278,
  },
  {
    name: "BillingProfileInput",
    schema: 283,
  },
  {
    name: "BillingCancelSubscriptionInput",
    schema: 292,
  },
  {
    name: "BillingSubscriptionInput",
    schema: 295,
  },
  {
    name: "BillingDefaultPaymentInput",
    schema: 296,
  },
  {
    name: "BillingRemovePaymentInput",
    schema: 298,
  },
  {
    name: "BillingPortalInput",
    schema: 299,
  },
  {
    name: "PublicSupportCreateConversation",
    schema: 300,
  },
  {
    name: "PublicSupportSendMessage",
    schema: 306,
  },
  {
    name: "PublicSupportEmptyBody",
    schema: 307,
  },
  {
    name: "AccountUpdate",
    schema: 308,
  },
  {
    name: "AccountDeletion",
    schema: 310,
  },
  {
    name: "NotificationPreferenceUpdate",
    schema: 312,
  },
  {
    name: "NotificationRoutingUpdate",
    schema: 316,
  },
  {
    name: "OrganizationSettingsUpdate",
    schema: 319,
  },
  {
    name: "OrganizationSlugUpdate",
    schema: 320,
  },
  {
    name: "OrganizationDeletion",
    schema: 322,
  },
  {
    name: "OrganizationRetentionUpdate",
    schema: 323,
  },
  {
    name: "EmptyIntegrationInput",
    schema: 326,
  },
  {
    name: "RepositorySettingsInput",
    schema: 327,
  },
  {
    name: "RepositoryPullRequestsInput",
    schema: 329,
  },
  {
    name: "RepositoryLinkInput",
    schema: 330,
  },
  {
    name: "RevokeAccountSessionsInput",
    schema: 331,
  },
  {
    name: "CodeAuditQuoteApprovalInput",
    schema: 334,
  },
  {
    name: "BillingQuote",
    schema: 336,
  },
];
