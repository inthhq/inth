package com.c15t.demo

import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.iab.AdTechProvider
import com.c15t.core.iab.IabListAvailability
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.store.TcStorageBusKeys
import java.net.URI
import kotlinx.serialization.json.*

/** Non-secret reviewer setup. The format accepts no fixture identity or credentials. */
@ConsistentCopyVisibility
internal data class TcfReviewProfile private constructor(
    val backend: String,
    val privacy: String,
    val cmpId: Int,
    val cmpVersion: Int,
    val publisherCountry: String,
    val vendors: List<Int>?,
) {
    fun nativeConfig() = NativeConfig(
        portalUrl = backend,
        consentCategories = ConsentCategory.entries,
        vendors = vendors,
        iab = IabConfiguration(cmpId = cmpId, cmpVersion = cmpVersion, publisherCountryCode = publisherCountry),
    )

    fun storedValues(): Map<String, String> = mapOf(
        "schema" to "1", "backend" to backend, "privacy" to privacy,
        "cmpId" to cmpId.toString(), "cmpVersion" to cmpVersion.toString(),
        "publisherCountry" to publisherCountry, "vendors" to vendors.orEmpty().joinToString(","),
    )

    companion object {
        fun parse(backend: String, privacy: String, cmpId: String, cmpVersion: String, country: String, vendors: String): TcfReviewProfile {
            fun url(value: String): String {
                val text = value.trim()
                val uri = runCatching { URI(text) }.getOrNull()
                require(uri?.scheme == "https" && !uri.host.isNullOrBlank() && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) {
                    "Review URLs must use HTTPS and have no credentials, query or fragment."
                }
                return text
            }
            val id = cmpId.trim().toIntOrNull()
            require(id != null && id in 2..4095) { "Enter the assigned CMP ID, from 2 to 4095." }
            val version = cmpVersion.trim().toIntOrNull()
            require(version != null && version in 0..4095) { "Enter the internal CMP version, from 0 to 4095." }
            val cc = country.trim()
            require(cc.matches(Regex("[A-Z]{2}"))) { "Enter the publisher country as two uppercase letters." }
            val scope = if (vendors.isBlank()) null else vendors.split(',').map { item ->
                val vendor = item.trim().toIntOrNull()
                require(vendor != null && vendor in 1..65535) { "Vendor scope must contain comma-separated IDs from 1 to 65535." }
                vendor
            }.also { require(it.size == it.toSet().size) { "Vendor scope must not repeat an ID." } }
            return TcfReviewProfile(url(backend), url(privacy), id, version, cc, scope)
        }

        fun restore(values: Map<String, *>): TcfReviewProfile? {
            if (values.isEmpty()) return null
            require(values["schema"] == "1") { "Saved review setup has an unsupported format." }
            fun text(key: String): String = values[key] as? String ?: error("Saved review setup is missing $key.")
            return parse(text("backend"), text("privacy"), text("cmpId"), text("cmpVersion"), text("publisherCountry"), text("vendors"))
        }
    }
}

/** One explicit observation. Text and JSON never reread the core or platform storage. */
internal data class TcfReviewCapture(val text: String, val json: String)

internal data class TcfReviewBuild(
    val appId: String,
    val appVersion: String,
    val appBuild: String,
    val buildType: String,
    val sdkVersion: String,
)

/** Explicit fields keep subject IDs, external IDs, tokens and receipts out of reports. */
internal fun captureTcfReview(
    profile: TcfReviewProfile,
    build: TcfReviewBuild,
    snapshot: ConsentSnapshot,
    consent: IabCommittedConsent?,
    iabStatus: IabListAvailability,
    additionalConsentStatus: IabListAvailability,
    adTechProviders: List<AdTechProvider>?,
    platformValues: Map<String, *>,
    capturedAtMs: Long,
    lastError: String = "none",
): TcfReviewCapture {
    val list = snapshot.iab?.gvl
    val google = list?.vendors?.get(755)
    fun nullable(value: String?): JsonElement = value?.let(::JsonPrimitive) ?: JsonNull
    fun numbers(values: List<Long>?): JsonElement = values?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull
    val evidence = buildJsonObject {
        put("schemaVersion", 1)
        put("platform", "android")
        put("capturedAtMs", capturedAtMs)
        putJsonObject("app") {
            put("id", build.appId)
            put("version", build.appVersion)
            put("build", build.appBuild)
        }
        put("sdkVersion", build.sdkVersion)
        putJsonObject("configuration") {
            put("cmpId", profile.cmpId)
            put("cmpVersion", profile.cmpVersion)
            put("publisherCountry", profile.publisherCountry)
            put("vendorIds", profile.vendors?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
        }
        putJsonObject("core") {
            put("policyPending", snapshot.policyPending)
            put("iabPolicy", snapshot.model == ConsentModel.IAB)
            put("tcString", nullable(consent?.tcString))
            put("additionalConsent", nullable(consent?.addtlConsent))
            put("vendorListVersion", consent?.vendorListVersion?.let(::JsonPrimitive) ?: JsonNull)
            put("policyVersion", consent?.policyVersion?.let(::JsonPrimitive) ?: JsonNull)
        }
        putJsonObject("disclosures") {
            put("vendorListVersion", list?.vendorListVersion?.let(::JsonPrimitive) ?: JsonNull)
            put("policyVersion", list?.tcfPolicyVersion?.let(::JsonPrimitive) ?: JsonNull)
            put("iabStatus", iabStatus.name.lowercase())
            put("googleVendor", google?.let { vendor -> buildJsonObject {
                put("id", 755)
                put("name", nullable(vendor.name))
                put("deleted", !vendor.deletedDate.isNullOrEmpty())
                put("purposes", numbers(vendor.purposes))
                put("legIntPurposes", numbers(vendor.legIntPurposes))
                put("flexiblePurposes", numbers(vendor.flexiblePurposes))
            } } ?: JsonNull)
            put("additionalConsentStatus", additionalConsentStatus.name.lowercase())
            put("adTechProviders", adTechProviders?.let { providers -> JsonArray(providers.map { provider -> buildJsonObject {
                put("id", provider.id)
                put("name", provider.name)
                put("policyUrl", provider.policyUrl)
            } }) } ?: JsonNull)
        }
        putJsonArray("storage") {
            TcStorageBusKeys.ALL_NAMES.sorted().forEach { key ->
                val value = platformValues[key]
                val type = when (value) {
                    null -> "absent"
                    is Int -> "Int"
                    is Long -> "Long"
                    is Float -> "Float"
                    is Boolean -> "Boolean"
                    is String -> "String"
                    else -> "unsupported"
                }
                add(buildJsonObject {
                    put("key", key)
                    put("type", type)
                    put("value", if (type == "absent" || type == "unsupported") JsonNull else JsonPrimitive(value.toString()))
                })
            }
        }
    }
    fun display(value: JsonElement?): String = when (value) {
        null, JsonNull -> "absent"
        is JsonPrimitive -> value.content
        else -> value.toString()
    }
    val core = evidence.getValue("core").jsonObject
    val disclosures = evidence.getValue("disclosures").jsonObject
    val text = buildString {
        appendLine("c15t Android TCF review")
        appendLine("Build: ${build.appId} ${build.appVersion} (${build.appBuild}) ${build.buildType}")
        appendLine("SDK: ${build.sdkVersion}")
        appendLine("Captured at epoch ms: $capturedAtMs")
        appendLine("Project: ${profile.backend}")
        appendLine("Privacy policy: ${profile.privacy}")
        appendLine("Configured CMP ID: ${profile.cmpId}")
        appendLine("Configured internal CMP version: ${profile.cmpVersion}")
        appendLine("Publisher country: ${profile.publisherCountry}")
        appendLine("Consent language: EN")
        appendLine("Vendor scope: ${profile.vendors?.joinToString(",") ?: "entire served list"}")
        appendLine("Registration and certification are not verified by this app.")
        appendLine("Google vendor disclosure is not consent or ad-serving eligibility.")
        appendLine()
        appendLine("Native core authority")
        appendLine("Ready: ${snapshot.ready}; policy pending: ${display(core["policyPending"])}; model: ${snapshot.model}")
        appendLine("Last reported error code: $lastError")
        appendLine("Committed TCString: ${display(core["tcString"])}")
        appendLine("Committed GVL version: ${display(core["vendorListVersion"])}")
        appendLine("Committed TCF policy version: ${display(core["policyVersion"])}")
        appendLine("Additional Consent: ${display(core["additionalConsent"])}")
        appendLine()
        appendLine("Retained native disclosures")
        appendLine("Loaded GVL version: ${display(disclosures["vendorListVersion"])}")
        appendLine("Loaded TCF policy version: ${display(disclosures["policyVersion"])}")
        appendLine("IAB list availability: ${display(disclosures["iabStatus"])}")
        appendLine("Google vendor 755: ${display(disclosures["googleVendor"])}")
        appendLine("Additional Consent list availability: ${display(disclosures["additionalConsentStatus"])}")
        appendLine("Retained ad-tech providers: ${display(disclosures["adTechProviders"])}")
        appendLine("Retained stale disclosures cannot authorize grants.")
        appendLine()
        appendLine("Actual application-default SharedPreferences")
        appendLine("Core, list status and storage are separate reads. This capture is not atomic; refresh after a transition. Text and JSON use the same captured observation.")
        evidence.getValue("storage").jsonArray.forEach { entry ->
            val row = entry.jsonObject
            val type = display(row["type"])
            val typed = if (type in setOf("absent", "unsupported")) type else "$type: ${display(row["value"])}"
            appendLine("${display(row["key"])} = $typed")
        }
    }
    return TcfReviewCapture(text, Json { prettyPrint = true }.encodeToString(JsonObject.serializer(), evidence))
}
