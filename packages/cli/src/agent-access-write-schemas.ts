import type { InputSchema } from "./write-input.ts";

// Public API v2 write contracts, including refinements from the shared input codecs.
// approvedAuditPolicy is checked as a JSON object; the API validates its contents.
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
        schema: 9,
      },
      {
        key: "includeUrls",
        schema: 10,
      },
      {
        key: "maxDepth",
        schema: 11,
      },
      {
        key: "maxPages",
        schema: 12,
      },
      {
        key: "monitoringEnabled",
        schema: 6,
      },
      {
        key: "origin",
        schema: 13,
      },
      {
        key: "policyUrls",
        schema: 10,
      },
      {
        key: "projectId",
        schema: 4,
      },
      {
        key: "regionProfiles",
        schema: 14,
      },
      {
        key: "scheduleCadence",
        schema: 16,
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
    choices: [178, 5],
  },
  {
    minLength: 1,
    type: "string",
  },
  {
    type: "null",
  },
  {
    type: "boolean",
  },
  {
    maxLength: 1024,
    minLength: 1,
    type: "string",
  },
  {
    enumJson: ["true"],
    type: "boolean",
  },
  {
    enumJson: ['"mixed"', '"domain"', '"sitemap"', '"explicit_urls"'],
    type: "string",
  },
  {
    items: 4,
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
    items: 15,
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
        schema: 9,
      },
      {
        key: "includeUrls",
        schema: 10,
      },
      {
        key: "maxDepth",
        schema: 11,
      },
      {
        key: "maxPages",
        schema: 12,
      },
      {
        key: "monitoringEnabled",
        schema: 6,
      },
      {
        key: "origin",
        schema: 13,
      },
      {
        key: "policyUrls",
        schema: 10,
      },
      {
        key: "projectId",
        schema: 4,
      },
      {
        key: "regionProfiles",
        schema: 14,
      },
      {
        key: "scheduleCadence",
        schema: 16,
      },
      {
        key: "enabled",
        schema: 6,
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
        schema: 19,
      },
    ],
    required: ["i18n"],
    type: "object",
  },
  {
    choices: [20, 5],
  },
  {
    additional: 1,
    properties: [
      {
        key: "defaultProfile",
        schema: 21,
      },
      {
        key: "messages",
        schema: 22,
      },
    ],
    type: "object",
  },
  {
    maxLength: 128,
    type: "string",
  },
  {
    additional: 23,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "fallbackLanguage",
        schema: 24,
      },
      {
        key: "translations",
        schema: 25,
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
    additional: 26,
    keyMax: 32,
    type: "object",
  },
  {
    choices: [27, 28],
  },
  {
    maxLength: 20_000,
    type: "string",
  },
  {
    additional: 29,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 30],
  },
  {
    additional: 31,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 32],
  },
  {
    additional: 33,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 34],
  },
  {
    additional: 35,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 36],
  },
  {
    additional: 37,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 38],
  },
  {
    additional: 39,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 40],
  },
  {
    additional: 41,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 42],
  },
  {
    additional: 43,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 44],
  },
  {
    additional: 45,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 46],
  },
  {
    additional: 47,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 48],
  },
  {
    additional: 49,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 50],
  },
  {
    additional: 51,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 52],
  },
  {
    additional: 53,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 54],
  },
  {
    additional: 55,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 56],
  },
  {
    additional: 57,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 58],
  },
  {
    additional: 59,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 60],
  },
  {
    additional: 61,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 62],
  },
  {
    additional: 63,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 64],
  },
  {
    additional: 65,
    keyMax: 128,
    type: "object",
  },
  {
    choices: [27, 66],
  },
  {
    additional: 27,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "policies",
        schema: 68,
      },
    ],
    required: ["policies"],
    type: "object",
  },
  {
    items: 69,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "review",
        schema: 70,
      },
      {
        key: "legacyMaterial",
        schema: 70,
      },
      {
        key: "model",
        schema: 75,
      },
      {
        key: "prompt",
        schema: 76,
      },
      {
        key: "categories",
        schema: 77,
      },
      {
        key: "scopeMode",
        schema: 78,
      },
      {
        key: "preselectedCategories",
        schema: 77,
      },
      {
        key: "actions",
        schema: 79,
      },
      {
        key: "rights",
        schema: 81,
      },
      {
        key: "validity",
        schema: 70,
      },
      {
        key: "privacySignals",
        schema: 70,
      },
      {
        key: "copyRevision",
        schema: 72,
      },
      {
        key: "consent",
        schema: 70,
      },
      {
        key: "id",
        schema: 83,
      },
      {
        key: "i18n",
        schema: 70,
      },
      {
        key: "match",
        schema: 84,
      },
      {
        key: "proof",
        schema: 70,
      },
      {
        key: "ui",
        schema: 70,
      },
    ],
    required: ["id", "match"],
    type: "object",
  },
  {
    choices: [6, 71, 72, 5, 73, 74],
  },
  {
    type: "number",
  },
  {
    type: "string",
  },
  {
    items: 70,
    type: "array",
  },
  {
    additional: 70,
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
    items: 72,
    type: "array",
  },
  {
    enumJson: ['"strict"', '"permissive"'],
    type: "string",
  },
  {
    items: 80,
    type: "array",
  },
  {
    enumJson: ['"accept"', '"reject"', '"customize"'],
    type: "string",
  },
  {
    items: 82,
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
    additional: 70,
    keyMax: 128,
    type: "object",
  },
  {
    additional: 1,
    properties: [
      {
        key: "expectedInstanceId",
        schema: 86,
      },
      {
        key: "expectedBackendVersion",
        schema: 87,
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
        schema: 89,
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
        schema: 91,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 93,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    choices: [94, 98],
  },
  {
    additional: 1,
    properties: [
      {
        key: "checkoutAttemptId",
        schema: 95,
      },
      {
        key: "promotionCode",
        schema: 72,
      },
      {
        key: "plan",
        schema: 96,
      },
      {
        key: "product",
        schema: 97,
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
        schema: 99,
      },
      {
        key: "checkoutAttemptId",
        schema: 95,
      },
      {
        key: "plan",
        schema: 100,
      },
      {
        key: "product",
        schema: 101,
      },
      {
        key: "promotionCode",
        schema: 72,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 93,
      },
      {
        key: "approvedQuote",
        schema: 103,
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
        schema: 104,
      },
      {
        key: "discount",
        schema: 105,
      },
      {
        key: "lineItems",
        schema: 108,
      },
      {
        key: "nextCycle",
        schema: 111,
      },
      {
        key: "subtotal",
        schema: 110,
      },
      {
        key: "total",
        schema: 11,
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
    choices: [106, 5],
  },
  {
    additional: 1,
    properties: [
      {
        key: "amount",
        schema: 11,
      },
      {
        key: "label",
        schema: 107,
      },
    ],
    required: ["amount", "label"],
    type: "object",
  },
  {
    choices: [72, 5],
  },
  {
    items: 109,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "amount",
        schema: 110,
      },
      {
        key: "description",
        schema: 107,
      },
      {
        key: "label",
        schema: 72,
      },
    ],
    required: ["amount", "description", "label"],
    type: "object",
  },
  {
    type: "integer",
  },
  {
    choices: [112, 5],
  },
  {
    additional: 1,
    properties: [
      {
        key: "startsAt",
        schema: 113,
      },
      {
        key: "total",
        schema: 11,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 115,
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
        schema: 95,
      },
      {
        key: "catalogVersion",
        schema: 12,
      },
      {
        key: "credits",
        schema: 12,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 115,
      },
      {
        key: "approvedQuote",
        schema: 103,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 118,
      },
    ],
    required: ["input"],
    type: "object",
  },
  {
    choices: [119, 120],
  },
  {
    additional: 1,
    properties: [
      {
        key: "catalogVersion",
        schema: 12,
      },
      {
        key: "enabled",
        schema: 8,
      },
      {
        key: "monthlyPurchaseLimit",
        schema: 12,
      },
      {
        key: "quantityCredits",
        schema: 12,
      },
      {
        key: "requestId",
        schema: 95,
      },
      {
        key: "thresholdCredits",
        schema: 12,
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
        schema: 121,
      },
      {
        key: "requestId",
        schema: 95,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 123,
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
        schema: 124,
      },
      {
        key: "businessName",
        schema: 130,
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
        schema: 125,
      },
      {
        key: "country",
        schema: 127,
      },
      {
        key: "line1",
        schema: 128,
      },
      {
        key: "line2",
        schema: 125,
      },
      {
        key: "postalCode",
        schema: 129,
      },
      {
        key: "state",
        schema: 125,
      },
    ],
    required: ["city", "country", "line1", "line2", "postalCode", "state"],
    type: "object",
  },
  {
    choices: [126, 5],
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
    choices: [24, 5],
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
        schema: 4,
      },
      {
        key: "input",
        schema: 132,
      },
      {
        key: "confirmCancellation",
        schema: 8,
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
        schema: 133,
      },
      {
        key: "requestId",
        schema: 95,
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
        schema: 4,
      },
      {
        key: "input",
        schema: 132,
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
        schema: 4,
      },
      {
        key: "paymentMethodId",
        schema: 136,
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
        schema: 4,
      },
      {
        key: "paymentMethodId",
        schema: 136,
      },
      {
        key: "confirmPaymentMethodId",
        schema: 136,
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
        schema: 4,
      },
    ],
    type: "object",
  },
  {
    choices: [140],
  },
  {
    additional: 1,
    properties: [
      {
        key: "clientMessageId",
        schema: 141,
      },
      {
        key: "text",
        schema: 72,
      },
      {
        key: "attachmentIds",
        schema: 142,
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
    choices: [143, 5],
  },
  {
    items: 144,
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
        schema: 141,
      },
      {
        key: "text",
        schema: 72,
      },
      {
        key: "attachmentIds",
        schema: 142,
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
        schema: 6,
      },
      {
        key: "name",
        schema: 148,
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
        schema: 150,
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
        schema: 152,
      },
      {
        key: "family",
        schema: 153,
      },
      {
        key: "enabled",
        schema: 6,
      },
      {
        key: "mode",
        schema: 154,
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
        schema: 156,
      },
      {
        key: "configured",
        schema: 6,
      },
      {
        key: "userIds",
        schema: 157,
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
    items: 136,
    maxItems: 500,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "name",
        schema: 176,
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
        schema: 160,
      },
      {
        key: "expectedSlug",
        schema: 160,
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
        schema: 136,
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
        schema: 148,
      },
      {
        key: "expectedVersion",
        schema: 163,
      },
      {
        key: "providerRetention",
        schema: 164,
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
        schema: 167,
      },
      {
        key: "ignoredPaths",
        schema: 167,
      },
    ],
    type: "object",
  },
  {
    items: 177,
    maxItems: 100,
    type: "array",
  },
  {
    additional: 1,
    properties: [
      {
        key: "enabled",
        schema: 6,
      },
      {
        key: "branchFilters",
        schema: 167,
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
        schema: 136,
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
        schema: 171,
      },
      {
        key: "confirmation",
        schema: 172,
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
        schema: 136,
      },
      {
        key: "quoteId",
        schema: 136,
      },
      {
        key: "candidatePlanChecksum",
        schema: 7,
      },
      {
        key: "maxCredits",
        schema: 163,
      },
      {
        key: "requestId",
        schema: 174,
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
        schema: 104,
      },
      {
        key: "discount",
        schema: 105,
      },
      {
        key: "lineItems",
        schema: 108,
      },
      {
        key: "nextCycle",
        schema: 111,
      },
      {
        key: "subtotal",
        schema: 110,
      },
      {
        key: "total",
        schema: 11,
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
  {
    type: "object",
  },
];

export const WRITE_SCHEMA_NAMES: { name: string; schema: number }[] = [
  {
    name: "WebsiteTargetCreate",
    schema: 2,
  },
  {
    name: "WebsiteTargetUpdate",
    schema: 17,
  },
  {
    name: "ProjectConsentI18nUpdate",
    schema: 18,
  },
  {
    name: "ProjectConsentPoliciesUpdate",
    schema: 67,
  },
  {
    name: "ProjectConsentLifecycleMutation",
    schema: 85,
  },
  {
    name: "ProjectConsentRuntimeKeyCreate",
    schema: 88,
  },
  {
    name: "ProjectConsentRuntimeKeyRotate",
    schema: 90,
  },
  {
    name: "BillingPlanPreviewInput",
    schema: 92,
  },
  {
    name: "BillingPlanChangeInput",
    schema: 102,
  },
  {
    name: "BillingCreditPreviewInput",
    schema: 114,
  },
  {
    name: "BillingCreditPurchaseInput",
    schema: 116,
  },
  {
    name: "BillingAutoTopUpInput",
    schema: 117,
  },
  {
    name: "BillingProfileInput",
    schema: 122,
  },
  {
    name: "BillingCancelSubscriptionInput",
    schema: 131,
  },
  {
    name: "BillingSubscriptionInput",
    schema: 134,
  },
  {
    name: "BillingDefaultPaymentInput",
    schema: 135,
  },
  {
    name: "BillingRemovePaymentInput",
    schema: 137,
  },
  {
    name: "BillingPortalInput",
    schema: 138,
  },
  {
    name: "PublicSupportCreateConversation",
    schema: 139,
  },
  {
    name: "PublicSupportSendMessage",
    schema: 145,
  },
  {
    name: "PublicSupportEmptyBody",
    schema: 146,
  },
  {
    name: "AccountUpdate",
    schema: 147,
  },
  {
    name: "AccountDeletion",
    schema: 149,
  },
  {
    name: "NotificationPreferenceUpdate",
    schema: 151,
  },
  {
    name: "NotificationRoutingUpdate",
    schema: 155,
  },
  {
    name: "OrganizationSettingsUpdate",
    schema: 158,
  },
  {
    name: "OrganizationSlugUpdate",
    schema: 159,
  },
  {
    name: "OrganizationDeletion",
    schema: 161,
  },
  {
    name: "OrganizationRetentionUpdate",
    schema: 162,
  },
  {
    name: "EmptyIntegrationInput",
    schema: 165,
  },
  {
    name: "RepositorySettingsInput",
    schema: 166,
  },
  {
    name: "RepositoryPullRequestsInput",
    schema: 168,
  },
  {
    name: "RepositoryLinkInput",
    schema: 169,
  },
  {
    name: "RevokeAccountSessionsInput",
    schema: 170,
  },
  {
    name: "CodeAuditQuoteApprovalInput",
    schema: 173,
  },
  {
    name: "BillingQuote",
    schema: 175,
  },
];
