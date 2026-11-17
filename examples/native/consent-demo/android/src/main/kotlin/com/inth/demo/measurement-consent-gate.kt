// #region docs:android-measurement-gate title="MeasurementConsentGate.kt"
package com.c15t.demo

import android.os.Handler
import android.os.Looper
import com.c15t.core.C15t
import com.c15t.core.model.ConsentCategory

class MeasurementConsentGate(
    private val setCollectionEnabled: (Boolean) -> Unit,
) : AutoCloseable {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var closed = false
    private val onPermission: (Boolean) -> Unit = {
        main.post {
            if (!closed) setCollectionEnabled(C15t.isAllowed(ConsentCategory.MEASUREMENT))
        }
    }
    private val subscription = C15t.gate(ConsentCategory.MEASUREMENT, onPermission)

    override fun close() {
        closed = true
        subscription.close()
        main.post { setCollectionEnabled(false) }
    }
}
// #endregion docs:android-measurement-gate
