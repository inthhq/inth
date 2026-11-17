package com.inth.consumer

import android.app.Activity
import android.os.Bundle
import android.widget.TextView
import com.inth.android.InthAndroid
import com.inth.core.Inth
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.wire.SnapshotWire

class MainActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        InthAndroid.install(this, NativeConfig("https://your-project.inth.app"))
        setContentView(TextView(this).apply {
            text = "${Inth.isAllowed(ConsentCategory.MARKETING)}: ${Inth.snapshot()?.let { SnapshotWire.encodeToString(it) }}"
        })
    }
}
