package com.c15t.reactnative

import com.c15t.consentui.ConsentHostOutcome
import com.c15t.consentui.ConsentHostPresentation
import com.c15t.consentui.ConsentHostSession
import com.c15t.core.store.C15tJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The bridge encodings of the stock consent host's answers. They live beside
 * [C15tNativeUi] because they name `c15t-consent-ui` types, which a build without the
 * stock screens does not link.
 */
internal object C15tHostPayload {
	/**
	 * The answer to `presentConsentPrompt` and `presentPreferences`, in the
	 * `ConsentPresenterSession` shape `src/native/presenter.ts` reads.
	 */
	fun consentHostSession(session: ConsentHostSession): String = encode(
		buildJsonObject {
			when (session) {
				is ConsentHostSession.Presented -> {
					put("sessionId", session.sessionId)
					put("status", "presented")
					put("presentation", presentation(session.presentation))
				}
				is ConsentHostSession.AlreadyPresented -> {
					put("sessionId", session.sessionId)
					put("status", "already-presented")
					put("presentation", presentation(session.presentation))
				}
				ConsentHostSession.NotRequired -> {
					put("sessionId", JsonNull)
					put("status", "not-required")
				}
			}
		},
	)

	private fun presentation(value: ConsentHostPresentation): String = when (value) {
		ConsentHostPresentation.PROMPT -> "prompt"
		ConsentHostPresentation.PREFERENCES -> "preferences"
	}

	/** An `onConsentPresenterPresented` event: a session is on screen. */
	fun consentHostPresented(sessionId: String, presentation: ConsentHostPresentation, automatic: Boolean): String = encode(
		buildJsonObject {
			put("sessionId", sessionId)
			put("presentation", presentation(presentation))
			put("automatic", automatic)
		},
	)

	/** An `onConsentPresenterOutcome` event, in the `ConsentPresenterOutcome` shape. */
	fun consentHostOutcome(outcome: ConsentHostOutcome): String = encode(
		buildJsonObject {
			put("sessionId", outcome.sessionId)
			put(
				"kind",
				when (outcome) {
					is ConsentHostOutcome.Committed -> "committed"
					is ConsentHostOutcome.Acknowledged -> "acknowledged"
					is ConsentHostOutcome.Dismissed -> "dismissed"
					is ConsentHostOutcome.Unavailable -> "unavailable"
				},
			)
			put("revision", outcome.revision)
		},
	)

	private fun encode(body: JsonObject): String = C15tJson.storage.encodeToString(JsonObject.serializer(), body)
}
