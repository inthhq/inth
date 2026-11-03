// #region docs:android-category-save title="save-measurement-choice.kt"
package com.c15t.demo

import com.c15t.core.C15tKernel
import com.c15t.core.CommitIntent
import com.c15t.core.CommitResult
import com.c15t.core.model.ConsentCategory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

suspend fun saveMeasurementChoice(
    core: C15tKernel,
    enabled: Boolean,
    expectedRevision: Long,
): CommitResult = withContext(Dispatchers.IO) {
    core.save(
        CommitIntent.Explicit(mapOf(ConsentCategory.MEASUREMENT to enabled)),
        expectedRevision = expectedRevision,
    )
}
// #endregion docs:android-category-save
