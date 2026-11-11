---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Pass app consent to your site in a WebView

`ConsentWebView` keeps the pages a WebView loads in step with native consent,
so a site running web c15t with `webViewConsentSource()` shows no second
banner.

- Swift: `try ConsentWebView(webView:core:allowedOrigins:onPreferencesRequested:)`
  in C15tApple, for `WKWebView`.
- Kotlin: `ConsentWebView.attach(webView, core, allowedOrigins, onPreferencesRequested)`
  in c15t-android. It needs `WebViewFeature.DOCUMENT_START_SCRIPT` and returns
  `null` without it. c15t-android now depends on `androidx.webkit` 1.14.0.

Only the top frame of a listed origin receives the state: permissions, model,
the committed IAB TC string and, when GPP is on, the GPP string. The subject ID
stays in the app.
Consent flows from the app to the page; a page can only ask the app to open its
preferences, and that request must carry a key only the page's top frame
holds. `WebViewConsentScript`, `WebViewConsentState` and `WebViewConsentSync`
in the cores build the scripts and keep a WebView in step, for hosts with
their own WebView glue.
