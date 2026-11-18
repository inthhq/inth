// #region docs:android-category-save title="save-measurement-choice.kt"
package com.inth.demo

import com.inth.android.awaitSave
import com.inth.core.ConsentCore
import com.inth.core.CommitIntent
import com.inth.core.CommitResult
import com.inth.core.model.ConsentCategory

suspend fun saveMeasurementChoice(
    core: ConsentCore,
    enabled: Boolean,
    expectedRevision: Long,
): CommitResult = core.awaitSave(
    CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to enabled)),
    expectedRevision = expectedRevision,
)
// #endregion docs:android-category-save
