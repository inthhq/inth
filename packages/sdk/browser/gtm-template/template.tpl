___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.


___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "Inth Consent Management",
  "categories": [
    "TAG_MANAGEMENT",
    "UTILITY"
  ],
  "brand": {
    "id": "github.com_c15t",
    "displayName": "Inth"
  },
  "description": "Load the Inth consent banner and set Google Consent Mode v2 from the visitor's choice. Fire it on the Consent Initialization - All Pages trigger.",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "CHECKBOX",
    "name": "loadScript",
    "checkboxText": "Load Inth from this tag",
    "simpleValueType": true,
    "defaultValue": true,
    "help": "Untick this when your page already loads the Inth script tag. The tag then only sends consent to Google's tags."
  },
  {
    "type": "TEXT",
    "name": "scriptUrl",
    "displayName": "Inth script URL",
    "simpleValueType": true,
    "valueHint": "https://your-project.inth.app/inth.js",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      },
      {
        "type": "REGEX",
        "args": [
          "^https://([a-z0-9-]+\\.inth\\.app/inth(\\.headless|\\.iab)?|cdn\\.jsdelivr\\.net/npm/@inth/sdk@[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?/lib/browser/dist/inth(\\.headless|\\.iab)?)\\.js$"
        ],
        "errorMessage": "Use your Inth project URL with /inth.js on the end, or a jsDelivr URL for an exact @inth/sdk version, such as 3.2.0, and inth.js, inth.headless.js or inth.iab.js."
      }
    ],
    "enablingConditions": [
      {
        "paramName": "loadScript",
        "paramValue": true,
        "type": "EQUALS"
      }
    ],
    "help": "Your Inth project URL with /inth.js on the end, such as https://your-project.inth.app/inth.js. You can also load an exact version from jsDelivr, such as https://cdn.jsdelivr.net/npm/@inth/sdk@3.2.0/lib/browser/dist/inth.js. Tags such as latest and ranges such as 3.1 are not accepted, because jsDelivr would serve new releases without a container change. A self-hosted backend is not supported here; add its script tag to your page instead."
  },
  {
    "type": "TEXT",
    "name": "projectUrl",
    "displayName": "Project URL",
    "simpleValueType": true,
    "valueHint": "https://your-project.inth.app",
    "enablingConditions": [
      {
        "paramName": "loadScript",
        "paramValue": true,
        "type": "EQUALS"
      }
    ],
    "help": "Required for jsDelivr's inth.js. Inth serves its /inth.js with the project URL already set."
  },
  {
    "type": "GROUP",
    "name": "categoriesGroup",
    "displayName": "Consent categories",
    "groupStyle": "NO_ZIPPY",
    "enablingConditions": [
      {
        "paramName": "loadScript",
        "paramValue": true,
        "type": "EQUALS"
      }
    ],
    "help": "What Inth asks the visitor about, besides strictly necessary. Tick each purpose your container's tags serve. Untick all to keep the categories your Inth setup already sets.",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "categoryMeasurement",
        "checkboxText": "Analytics (analytics_storage)",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "CHECKBOX",
        "name": "categoryMarketing",
        "checkboxText": "Marketing (ad_storage, ad_user_data, ad_personalization)",
        "simpleValueType": true,
        "defaultValue": true
      },
      {
        "type": "CHECKBOX",
        "name": "categoryFunctionality",
        "checkboxText": "Functionality (functionality_storage)",
        "simpleValueType": true,
        "defaultValue": false
      },
      {
        "type": "CHECKBOX",
        "name": "categoryExperience",
        "checkboxText": "Experience (personalization_storage)",
        "simpleValueType": true,
        "defaultValue": false
      }
    ]
  },
  {
    "type": "GROUP",
    "name": "consentModeGroup",
    "displayName": "Google Consent Mode",
    "groupStyle": "NO_ZIPPY",
    "subParams": [
      {
        "type": "PARAM_TABLE",
        "name": "defaultSettings",
        "displayName": "Default consent state",
        "paramTableColumns": [
          {
            "param": {
              "type": "TEXT",
              "name": "region",
              "displayName": "Region",
              "simpleValueType": true,
              "help": "Comma-separated ISO 3166-2 codes, such as DE, FR, US-CA. Leave blank for every region."
            },
            "isUnique": true
          },
          {
            "param": {
              "type": "SELECT",
              "name": "ad_storage",
              "displayName": "Ad storage",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "ad_user_data",
              "displayName": "Ad user data",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "ad_personalization",
              "displayName": "Ad personalization",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "analytics_storage",
              "displayName": "Analytics storage",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "functionality_storage",
              "displayName": "Functionality storage",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "personalization_storage",
              "displayName": "Personalization storage",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "denied"
            },
            "isUnique": false
          },
          {
            "param": {
              "type": "SELECT",
              "name": "security_storage",
              "displayName": "Security storage",
              "selectItems": [
                {"value": "denied", "displayValue": "Denied"},
                {"value": "granted", "displayValue": "Granted"}
              ],
              "simpleValueType": true,
              "defaultValue": "granted"
            },
            "isUnique": false
          }
        ],
        "newRowButtonText": "Add a region",
        "help": "What Google's tags may do before Inth reports the visitor's permissions. With no rows, every type is denied except security storage, which follows Inth's necessary category. If you add region rows, add one with Region blank for everyone else."
      },
      {
        "type": "TEXT",
        "name": "waitForUpdate",
        "displayName": "Wait for update (milliseconds)",
        "simpleValueType": true,
        "defaultValue": "500",
        "valueValidators": [
          {
            "type": "NON_NEGATIVE_NUMBER"
          }
        ],
        "help": "How long Google's tags wait for Inth before they use the defaults above."
      },
      {
        "type": "CHECKBOX",
        "name": "adsDataRedaction",
        "checkboxText": "Redact ads data when ad storage is denied",
        "simpleValueType": true,
        "defaultValue": false
      },
      {
        "type": "CHECKBOX",
        "name": "urlPassthrough",
        "checkboxText": "Pass ad click information in URLs when storage is denied",
        "simpleValueType": true,
        "defaultValue": false
      }
    ]
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

// Inth Consent Management for Google Tag Manager.
//
// Sets the Google Consent Mode v2 default, loads the @inth/sdk script tag
// build, and turns each Inth permission change into a consent update. It talks
// to Inth only through the documented `window.inth` queue, so it works whether
// this tag or the page loads Inth, and in either order.
//
// Uses setDefaultConsentState and updateConsentState, never
// gtag('consent', ...), so updates stay in order with the container's events.

const copyFromWindow = require('copyFromWindow');
const createQueue = require('createQueue');
const gtagSet = require('gtagSet');
const injectScript = require('injectScript');
const log = require('logToConsole');
const makeNumber = require('makeNumber');
const setDefaultConsentState = require('setDefaultConsentState');
const templateStorage = require('templateStorage');
const updateConsentState = require('updateConsentState');

const CONSENT_TYPES = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
  'functionality_storage',
  'personalization_storage',
  'security_storage'
];

// Inth category -> Google consent types. Matches the default mapping of the
// googleTagManager() helper in @inth/integrations.
const CONSENT_MAPPING = {
  necessary: ['security_storage'],
  functionality: ['functionality_storage'],
  measurement: ['analytics_storage'],
  marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
  experience: ['personalization_storage']
};

// Inth category -> the checkbox that asks about it.
const CATEGORY_FIELDS = {
  functionality: 'categoryFunctionality',
  measurement: 'categoryMeasurement',
  marketing: 'categoryMarketing',
  experience: 'categoryExperience'
};

const INTH_HOST_SUFFIX = '.inth.app';
const JSDELIVR_PREFIX = 'cdn.jsdelivr.net/npm/@inth/sdk@';
const DIGITS = '0123456789';
const PRERELEASE_CHARS =
  DIGITS + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-';
// Bundles that install Inth, from an Inth project or from @inth/sdk on
// jsDelivr. Add-ons such as inth.gpp.js wait for one of these, so loading
// one alone would show nothing and never send an update.
const INTH_FILES = ['inth.js', 'inth.headless.js', 'inth.iab.js'];

const isType = (key) => CONSENT_TYPES.indexOf(key) !== -1;
const isValue = (value) => value === 'granted' || value === 'denied';
const isList = (value) =>
  !!value && typeof value === 'object' && typeof value.length === 'number';

const endsWith = (value, suffix) =>
  value.length >= suffix.length &&
  value.substring(value.length - suffix.length) === suffix;

const onlyChars = (value, chars) => {
  if (value === '') return false;
  for (let i = 0; i < value.length; i += 1) {
    if (chars.indexOf(value.charAt(i)) === -1) return false;
  }
  return true;
};

// An exact version such as 3.1.0 or 3.2.0-canary.4. jsDelivr resolves tags
// such as latest and ranges such as 3.1 to whatever was released last.
const isExactVersion = (version) => {
  const dash = version.indexOf('-');
  const core = dash === -1 ? version : version.substring(0, dash);
  const parts = core.split('.');
  if (parts.length !== 3) return false;
  for (let i = 0; i < parts.length; i += 1) {
    if (!onlyChars(parts[i], DIGITS)) return false;
  }
  return (
    dash === -1 || onlyChars(version.substring(dash + 1), PRERELEASE_CHARS)
  );
};

// Matches the script URL field's validator: an Inth project's bundle, or
// one from an exact @inth/sdk version on jsDelivr.
const isAllowedScriptUrl = (url) => {
  if (typeof url !== 'string' || url.indexOf('https://') !== 0) return false;
  if (url.indexOf('?') !== -1 || url.indexOf('#') !== -1) return false;
  const rest = url.substring('https://'.length);
  const slash = rest.lastIndexOf('/');
  if (slash === -1) return false;
  const file = rest.substring(slash + 1);
  const dir = rest.substring(0, slash);
  if (dir.indexOf(JSDELIVR_PREFIX) === 0) {
    const version = dir.substring(JSDELIVR_PREFIX.length);
    const dist = version.indexOf('/');
    return (
      INTH_FILES.indexOf(file) !== -1 &&
      dist > 0 &&
      version.substring(dist) === '/lib/browser/dist' &&
      isExactVersion(version.substring(0, dist))
    );
  }
  return (
    INTH_FILES.indexOf(file) !== -1 &&
    endsWith(dir, INTH_HOST_SUFFIX) &&
    dir.length > INTH_HOST_SUFFIX.length &&
    dir.indexOf('/') === -1
  );
};

// inth.js from jsDelivr runs in hosted mode and stops without a backend URL.
// Inth bundles carry their own.
const projectUrlProblem = (url, backend) => {
  if (url.indexOf('https://' + JSDELIVR_PREFIX) !== 0) return '';
  if (endsWith(url, '/inth.js') && backend === '') {
    return 'jsDelivr\'s inth.js needs a "Project URL".';
  }
  return '';
};

const splitRegions = (raw) => {
  const regions = [];
  if (typeof raw !== 'string') return regions;
  const parts = raw.split(',');
  for (let i = 0; i < parts.length; i += 1) {
    const code = parts[i].trim().toUpperCase();
    if (code !== '') regions.push(code);
  }
  return regions;
};

const readWaitForUpdate = () => {
  const raw =
    typeof data.waitForUpdate === 'string'
      ? data.waitForUpdate.trim()
      : data.waitForUpdate;
  // makeNumber('') is 0, which would turn the wait off.
  if (raw === undefined || raw === null || raw === '') return 500;
  const value = makeNumber(raw);
  // value === value is false only for NaN; the sandbox has no isNaN.
  return value === value && value >= 0 ? value : 500;
};

const readCategories = () => {
  const categories = [];
  for (const category in CATEGORY_FIELDS) {
    if (data[CATEGORY_FIELDS[category]] === true) categories.push(category);
  }
  return categories;
};

const toGoogleConsent = (permissions) => {
  const state = {};
  for (let i = 0; i < CONSENT_TYPES.length; i += 1) {
    state[CONSENT_TYPES[i]] = 'denied';
  }
  for (const category in CONSENT_MAPPING) {
    if (permissions[category] !== true) continue;
    const types = CONSENT_MAPPING[category];
    for (let i = 0; i < types.length; i += 1) {
      state[types[i]] = 'granted';
    }
  }
  return state;
};

// 1. Defaults, before any other tag fires.

gtagSet('ads_data_redaction', data.adsDataRedaction === true);
gtagSet('url_passthrough', data.urlPassthrough === true);

const waitForUpdate = readWaitForUpdate();
const defaultRows = isList(data.defaultSettings) ? data.defaultSettings : [];

if (defaultRows.length === 0) {
  setDefaultConsentState({
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: waitForUpdate
  });
} else {
  for (let i = 0; i < defaultRows.length; i += 1) {
    const row = defaultRows[i];
    const command = { wait_for_update: waitForUpdate };
    for (const key in row) {
      // Any other key would need a permission this tag does not have.
      if (isType(key) && isValue(row[key])) command[key] = row[key];
    }
    const regions = splitRegions(row.region);
    if (regions.length > 0) command.region = regions;
    setDefaultConsentState(command);
  }
}

// 2. Updates from Inth.

// Before `ready`, Inth has not resolved the visitor's policy yet, so its
// permissions are only the strict fallback. Sending them would end the wait
// above early.
const applySnapshot = (snapshot) => {
  const permissions = snapshot && snapshot.effectivePermissions;
  if (!permissions || typeof permissions !== 'object') {
    log('inth: a consent event had no permissions; consent was not updated.');
    return;
  }
  updateConsentState(toGoogleConsent(permissions));
  // A tag blocked by its consent settings does not fire again by itself, so
  // tags that wait for consent use this event as their trigger.
  createQueue('dataLayer')({ event: 'consent-update' });
};

const onReady = (snapshot) => {
  templateStorage.setItem('inthReady', true);
  applySnapshot(snapshot);
};

const onConsent = (snapshot) => {
  if (templateStorage.getItem('inthReady') !== true) return;
  applySnapshot(snapshot);
};

// 3. Subscribe once per page and load Inth if asked to.

// `window.inth` is the queue array until the script runs, then the API,
// whose push() takes the same calls.
const inth = createQueue('inth');
const loaded = typeof copyFromWindow('inth.pkg') === 'string';
// Another firing may already be loading the script.
const inject =
  data.loadScript === true &&
  !loaded &&
  templateStorage.getItem('inthLoading') !== true;
const scriptUrl =
  typeof data.scriptUrl === 'string' ? data.scriptUrl.trim() : '';
const projectUrl =
  typeof data.projectUrl === 'string' ? data.projectUrl.trim() : '';

if (inject && !isAllowedScriptUrl(scriptUrl)) {
  log('inth: "Inth script URL" must be an Inth project /inth.js URL or a ' +
      'jsDelivr URL for an exact @inth/sdk version and inth.js, ' +
      'inth.headless.js or inth.iab.js. Got: ' + scriptUrl);
  data.gtmOnFailure();
} else if (inject && projectUrlProblem(scriptUrl, projectUrl) !== '') {
  log('inth: ' + projectUrlProblem(scriptUrl, projectUrl));
  data.gtmOnFailure();
} else {
  if (inject) {
    // A page that loads Inth only through this tag registers no scripts for
    // Inth to infer its categories from, so it would ask about none.
    const config = {};
    const categories = readCategories();
    if (projectUrl !== '') config.projectUrl = projectUrl;
    if (categories.length > 0) config.consentCategories = categories;
    if (config.projectUrl || config.consentCategories) inth(['config', config]);
  }
  // The queue keeps these through a failed load, so a retry reuses them.
  if (templateStorage.getItem('inthSubscribed') !== true) {
    templateStorage.setItem('inthSubscribed', true);
    inth(['on', 'ready', onReady]);
    inth(['on', 'consent', onConsent]);
  }

  if (inject) {
    templateStorage.setItem('inthLoading', true);
    injectScript(scriptUrl, data.gtmOnSuccess, () => {
      // Let a later firing try again.
      templateStorage.setItem('inthLoading', false);
      log('inth: could not load ' + scriptUrl);
      data.gtmOnFailure();
    });
  } else {
    data.gtmOnSuccess();
  }
}


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://*.inth.app/inth*"
              },
              {
                "type": 1,
                "string": "https://cdn.jsdelivr.net/npm/@inth/sdk@*"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "key"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"},
                  {"type": 1, "string": "execute"}
                ],
                "mapValue": [
                  {"type": 1, "string": "inth"},
                  {"type": 8, "boolean": true},
                  {"type": 8, "boolean": true},
                  {"type": 8, "boolean": false}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "key"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"},
                  {"type": 1, "string": "execute"}
                ],
                "mapValue": [
                  {"type": 1, "string": "inth.pkg"},
                  {"type": 8, "boolean": true},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": false}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "key"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"},
                  {"type": 1, "string": "execute"}
                ],
                "mapValue": [
                  {"type": 1, "string": "dataLayer"},
                  {"type": 8, "boolean": true},
                  {"type": 8, "boolean": true},
                  {"type": 8, "boolean": false}
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "write_data_layer",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keyPatterns",
          "value": {
            "type": 2,
            "listItem": [
              {"type": 1, "string": "ads_data_redaction"},
              {"type": 1, "string": "url_passthrough"}
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_template_storage",
        "versionId": "1"
      },
      "param": []
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_consent",
        "versionId": "1"
      },
      "param": [
        {
          "key": "consentTypes",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "ad_storage"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "ad_user_data"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "ad_personalization"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "analytics_storage"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "functionality_storage"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "personalization_storage"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {"type": 1, "string": "consentType"},
                  {"type": 1, "string": "read"},
                  {"type": 1, "string": "write"}
                ],
                "mapValue": [
                  {"type": 1, "string": "security_storage"},
                  {"type": 8, "boolean": false},
                  {"type": 8, "boolean": true}
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
- name: An empty defaults table denies everything but security storage
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('createQueue', () => () => {});
    mock('copyFromWindow', () => undefined);

    runCode({ loadScript: false, waitForUpdate: '500' });

    assertApi('setDefaultConsentState').wasCalledWith({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500
    });
    assertApi('gtmOnSuccess').wasCalled();
- name: A region cell becomes a list of uppercase codes
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('createQueue', () => () => {});
    mock('copyFromWindow', () => undefined);

    let seen;
    mock('setDefaultConsentState', (command) => { seen = command; });

    runCode({
      loadScript: false,
      waitForUpdate: '',
      defaultSettings: [{ region: 'de, fr ,us-ca', analytics_storage: 'granted' }]
    });

    assertThat(seen.region).isEqualTo(['DE', 'FR', 'US-CA']);
    assertThat(seen.analytics_storage).isEqualTo('granted');
    assertThat(seen.wait_for_update).isEqualTo(500);
- name: The ready snapshot updates every consent type
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const listeners = {};
    mock('createQueue', () => (call) => {
      if (call[0] === 'on') listeners[call[1]] = call[2];
    });

    runCode({ loadScript: false, waitForUpdate: '500' });
    listeners.ready({
      effectivePermissions: {
        necessary: true,
        functionality: false,
        measurement: true,
        marketing: false,
        experience: true
      }
    });

    assertApi('updateConsentState').wasCalledWith({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
      functionality_storage: 'denied',
      personalization_storage: 'granted',
      security_storage: 'granted'
    });
- name: Each update is followed by a consent-update event
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const listeners = {};
    const order = [];
    mock('createQueue', (key) => (call) => {
      if (key === 'dataLayer') order.push(call.event);
      else if (call[0] === 'on') listeners[call[1]] = call[2];
    });
    mock('updateConsentState', () => { order.push('update'); });

    runCode({ loadScript: false, waitForUpdate: '500' });
    listeners.ready({ effectivePermissions: { necessary: true } });
    listeners.consent({ effectivePermissions: { necessary: true } });

    assertThat(order).isEqualTo(
      ['update', 'consent-update', 'update', 'consent-update']);
- name: A consent event before ready is ignored
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const listeners = {};
    mock('createQueue', () => (call) => {
      if (call[0] === 'on') listeners[call[1]] = call[2];
    });

    runCode({ loadScript: false, waitForUpdate: '500' });
    listeners.consent({ effectivePermissions: { necessary: true } });

    assertApi('updateConsentState').wasNotCalled();
- name: The tag queues the backend URL and loads the script
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const calls = [];
    mock('createQueue', () => (call) => { calls.push(call); });
    let injected;
    mock('injectScript', (url, onSuccess) => { injected = url; onSuccess(); });

    runCode({
      loadScript: true,
      scriptUrl: 'https://cdn.jsdelivr.net/npm/@inth/sdk@3.1.0/lib/browser/dist/inth.js',
      projectUrl: 'https://your-project.inth.app',
      waitForUpdate: '500'
    });

    assertThat(calls[0]).isEqualTo(['config', { projectUrl: 'https://your-project.inth.app' }]);
    assertThat(calls[1][1]).isEqualTo('ready');
    assertThat(calls[2][1]).isEqualTo('consent');
    assertThat(injected).isEqualTo(
      'https://cdn.jsdelivr.net/npm/@inth/sdk@3.1.0/lib/browser/dist/inth.js');
    assertApi('gtmOnSuccess').wasCalled();
- name: The tag queues the ticked categories with the backend URL
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const calls = [];
    mock('createQueue', () => (call) => { calls.push(call); });
    mock('injectScript', (url, onSuccess) => { onSuccess(); });

    runCode({
      loadScript: true,
      scriptUrl: 'https://your-project.inth.app/inth.js',
      categoryMeasurement: true,
      categoryMarketing: false,
      categoryExperience: true,
      waitForUpdate: '500'
    });

    assertThat(calls[0]).isEqualTo(
      ['config', { consentCategories: ['measurement', 'experience'] }]);
    assertThat(calls[1][1]).isEqualTo('ready');
- name: No ticked categories and no backend URL queue no config
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const calls = [];
    mock('createQueue', () => (call) => { calls.push(call); });
    mock('injectScript', (url, onSuccess) => { onSuccess(); });

    runCode({
      loadScript: true,
      scriptUrl: 'https://your-project.inth.app/inth.js',
      waitForUpdate: '500'
    });

    assertThat(calls[0][0]).isEqualTo('on');
    assertThat(calls.length).isEqualTo(2);
- name: inth already on the page is not loaded again
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('createQueue', () => () => {});
    mock('copyFromWindow', (key) => key === 'inth.pkg' ? '@inth/sdk' : undefined);

    runCode({
      loadScript: true,
      scriptUrl: 'https://your-project.inth.app/inth.js',
      waitForUpdate: '500'
    });

    assertApi('injectScript').wasNotCalled();
    assertApi('gtmOnSuccess').wasCalled();
- name: A URL outside the allowed hosts fails the tag
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('createQueue', () => () => {});
    mock('copyFromWindow', () => undefined);

    runCode({
      loadScript: true,
      scriptUrl: 'https://example.com/inth.js',
      waitForUpdate: '500'
    });

    assertApi('injectScript').wasNotCalled();
    assertApi('gtmOnFailure').wasCalled();
- name: The jsDelivr main bundle without a backend URL fails the tag
  code: |-
    mockObject('templateStorage', freshStorage());
    const calls = [];
    mock('createQueue', () => (call) => { calls.push(call); });
    mock('copyFromWindow', () => undefined);

    runCode({
      loadScript: true,
      scriptUrl: 'https://cdn.jsdelivr.net/npm/@inth/sdk@3.1.0/lib/browser/dist/inth.js',
      projectUrl: '',
      waitForUpdate: '500'
    });

    assertThat(calls.length).isEqualTo(0);
    assertApi('injectScript').wasNotCalled();
    assertApi('gtmOnFailure').wasCalled();
- name: A second firing on the same page does not subscribe again
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    let queued = 0;
    mock('createQueue', () => () => { queued += 1; });

    runCode({ loadScript: false, waitForUpdate: '500' });
    runCode({ loadScript: false, waitForUpdate: '500' });

    assertThat(queued).isEqualTo(2);
- name: A firing after a failed load tries again without subscribing again
  code: |-
    mockObject('templateStorage', freshStorage());
    mock('copyFromWindow', () => undefined);
    const calls = [];
    mock('createQueue', () => (call) => { calls.push(call); });
    let attempts = 0;
    mock('injectScript', (url, onSuccess, onFailure) => {
      attempts += 1;
      if (attempts === 1) onFailure(); else onSuccess();
    });
    const mockData = {
      loadScript: true,
      scriptUrl: 'https://your-project.inth.app/inth.js',
      waitForUpdate: '500'
    };

    runCode(mockData);
    runCode(mockData);

    assertThat(attempts).isEqualTo(2);
    assertThat(calls.length).isEqualTo(2);
    assertApi('gtmOnFailure').wasCalled();
    assertApi('gtmOnSuccess').wasCalled();
setup: |-
  // templateStorage lives for the page, so each scenario needs its own.
  const freshStorage = () => {
    const store = {};
    return {
      getItem: (key) => store[key],
      setItem: (key, value) => { store[key] = value; },
      removeItem: (key) => { store[key] = undefined; },
      clear: () => {}
    };
  };


___NOTES___

Source: https://github.com/c15t/c15t/tree/canary/packages/browser/gtm-template
