package com.inth.core

import com.inth.core.model.ConsentAction
import com.inth.core.model.ConsentCategory

/**
 * What the subject did.
 *
 * Mirrors the `CommitIntent` of the shared contract: `'all' | 'necessary' |` an
 * explicit per-category map.
 */
sealed class CommitIntent {
	/** Complete native IAB draft with category choices. */
	data class Iab(
		val choices: com.inth.core.iab.IabChoices,
		val consents: Map<ConsentCategory, Boolean>,
	) : CommitIntent()

	/** Accept every optional category. */
	data object All : CommitIntent() {
		/** The consent map this intent writes. */
		val consents: Map<ConsentCategory, Boolean> = ConsentCategory.OPTIONAL.associateWith { true }
	}

	/** Grant `necessary` only, denying every optional category. */
	data object Necessary : CommitIntent() {
		/** The consent map this intent writes. */
		val consents: Map<ConsentCategory, Boolean> = ConsentCategory.OPTIONAL.associateWith { false }
	}

	/**
	 * A preference form result. Categories absent from [consents] stay undecided
	 * and keep whatever the policy default gives them.
	 */
	data class Custom(val consents: Map<ConsentCategory, Boolean>) : CommitIntent()

	/** The action label sent to the backend with this intent. */
	val action: ConsentAction
		get() = when (this) {
			is All -> ConsentAction.ALL
			is Necessary -> ConsentAction.NECESSARY
			is Custom,
				is Iab -> ConsentAction.CUSTOM
		}

	/** The category values this intent writes. */
	val consentsByCategory: Map<ConsentCategory, Boolean>
		get() = when (this) {
			is All -> All.consents
			is Necessary -> Necessary.consents
			is Custom -> consents
				is Iab -> consents
			}
}
