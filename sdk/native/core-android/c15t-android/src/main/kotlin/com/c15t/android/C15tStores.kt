// The bus sink below must open the application-default preferences file through
// the platform API the IAB CMP specification names. That API is deprecated, and
// the deprecation is the ecosystem still reading the file it picks -- there is no
// replacement that keeps the mirror where a vendor SDK looks, so the one warning
// this file can emit is the one it has to ignore.
@file:Suppress("DEPRECATION")

package com.c15t.android

import android.content.Context
import android.content.SharedPreferences
import android.preference.PreferenceManager
import com.c15t.core.store.ResilientKeyValueStore
import android.util.Log
import com.c15t.core.crypto.AesGcmCodec
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.store.C15tStore
import com.c15t.core.store.SubjectPreservingStore
import com.c15t.core.store.TcBusValue
import com.c15t.core.gpp.GppStorageBusKeys
import com.c15t.core.store.TcStorageBusKeys
import com.c15t.core.store.TcStorageBusSink
import java.io.File
import java.io.IOException

/**
 * Storage for the consent envelope, the write queue, and the subject id.
 *
 * The primary path keeps one encrypted blob per contract key under the app's
 * `noBackupFilesDir`, so consent never lands in a cloud backup or a `adb backup`
 * of shared preferences. When the keystore is unusable the contract's answer is a
 * `SharedPreferences` fallback with a single log line, and this factory is where
 * that decision is made.
 *
 * The subject id is the one thing deliberately not on that path. It is a random
 * `sub_` id, so encrypting it protects nothing, and storing it beside the records
 * meant a lost keystore key also lost the installation's identity. It gets its own
 * preference file, which no key can invalidate, so a keystore reset costs the
 * records and not the audit trail; [SubjectPreservingStore] does the routing and
 * carries over the id from installs that stored it encrypted.
 */
object C15tStores {
	private const val TAG = "c15t"
	private const val PREFS_NAME = "c15t.consent.fallback"

	/** Separate from the fallback file, which is where record data goes. */
	private const val SUBJECT_PREFS_NAME = "c15t.subject"

	@Volatile
	private var warnedAboutFallback = false

	/**
	 * Build the store for [context], choosing encrypted or fallback storage.
	 *
	 * Never throws: a host that cannot get an encrypted store still gets a working,
	 * if less protected, core, which is the trade the contract makes.
	 *
	 * The `IABTCF_*` bus rides along with every store this builds: no flag turns it
	 * on and no host step installs it, because the readers it exists for are third
	 * party code inside the host process that never asks permission first. See
	 * [DefaultPreferencesTcStorageBus].
	 */
	fun create(context: Context): C15tStore {
		val appContext = context.applicationContext
		val fallback = PreferencesStore(appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE))
		val identity = PreferencesStore(appContext.getSharedPreferences(SUBJECT_PREFS_NAME, Context.MODE_PRIVATE))
		val records = try {
			ResilientKeyValueStore(
				primary = EncryptedFileStore(
					File(appContext.noBackupFilesDir, StorePaths.DIRECTORY),
					AesGcmCodec(KeystoreKeyProvider(appContext)),
				),
				fallback = fallback,
				onFallback = ::warnOnce,
				onWriteFailure = ::warnAboutDroppedWrite,
			)
		} catch (error: Throwable) {
			warnOnce(error)
			fallback
		}
		return C15tStore(
			backend = SubjectPreservingStore(records = records, identity = identity),
			onReadFailure = { key, error ->
				// A blob this build cannot read is fail-closed inside C15tStore; say so
				// once per key so the field report is not silent.
				Log.w(TAG, "c15t could not read stored state for $key; serving deny-all", error)
			},
			tcStorageBus = DefaultPreferencesTcStorageBus(appContext),
		)
	}

	/**
	 * A write that encrypted fine but could not be written, or failed for a reason that
	 * is not a dead key. The records stay in memory and the next launch starts from
	 * nothing stored, which the contract accepts over putting them in the clear -- but
	 * only if a field report can find it, so this is the one line that says so.
	 */
	private fun warnAboutDroppedWrite(error: Throwable) {
		Log.e(TAG, "c15t could not write encrypted consent storage; this change will not survive a relaunch", error)
	}

	private fun warnOnce(error: Throwable) {
		if (warnedAboutFallback) {
			return
		}
		synchronized(this) {
			if (warnedAboutFallback) {
				return
			}
			warnedAboutFallback = true
			Log.w(TAG, "AndroidKeyStore unavailable, storing consent unencrypted in SharedPreferences", error)
		}
	}
}

/** One AES/GCM blob per key, one file per blob. */
internal class EncryptedFileStore(
	private val directory: File,
	private val codec: AesGcmCodec,
) : KeyValueStore {
	init {
		if (!directory.isDirectory && !directory.mkdirs()) {
			throw IllegalStateException("cannot create ${directory.absolutePath}")
		}
	}

	override fun read(key: String): String? {
		val name = StorePaths.fileName(key) ?: return null
		val file = File(directory, name)
		if (!file.isFile) {
			return null
		}
		// A null here means tampering, a rotated key, or a truncated write. C15tStore
		// turns it into "nothing stored", which the core answers with deny-all.
		return codec.decrypt(readBlob(file))?.let { String(it, Charsets.UTF_8) }
	}

	override fun write(
		key: String,
		value: String?,
	) {
		val name = StorePaths.fileName(key) ?: return
		val file = File(directory, name)
		if (value == null) {
			file.delete()
			return
		}
		writeAtomically(file, codec.encrypt(value.toByteArray(Charsets.UTF_8)))
	}

	override fun keys(): Set<String> {
		// File names are the contract keys. Anything StorePaths would not have written,
		// including the rename temporaries, is not ours to name back.
		val names = directory.list() ?: return emptySet()
		return names.filterTo(mutableSetOf()) { StorePaths.fileName(it) == it }
	}

	override fun writeDurably(key: String, value: String?): Boolean {
		write(key, value)
		return read(key) == value
	}

	override fun flush() {
		// Each write already lands through a rename, so there is nothing buffered.
	}

	// Only disk problems get swallowed here. A crypto or keystore failure has to
	// reach ResilientKeyValueStore, which is what decides to step down.
	private fun readBlob(file: File): ByteArray = try {
		file.readBytes()
	} catch (error: IOException) {
		Log.w(TAG, "unreadable c15t store file", error)
		ByteArray(0)
	}

	private fun writeAtomically(
		file: File,
		blob: ByteArray,
	) {
		val temp = File(file.parentFile, "${file.name}.tmp")
		try {
			temp.outputStream().use { stream ->
				stream.write(blob)
				stream.fd.sync()
			}
			if (!temp.renameTo(file)) throw IOException("cannot replace consent item")
		} catch (error: IOException) {
			Log.e(TAG, "failed to persist c15t state", error)
			temp.delete()
		}
	}

	private companion object {
		const val TAG = "c15t"
	}
}

/**
 * The contract's fallback when the keystore fails.
 *
 * Values are plain JSON in a private preference file: less protection, but the
 * core stays functional and the one-time warning is on the record.
 */
internal class PreferencesStore(private val prefs: SharedPreferences) : KeyValueStore {
	override fun read(key: String): String? = try {
		prefs.getString(key, null)
	} catch (error: Throwable) {
		// A corrupted preferences file must not crash a launch hook.
		Log.w(TAG, "unreadable c15t preference", error)
		null
	}

	override fun write(
		key: String,
		value: String?,
	) {
		try {
			prefs.edit().apply {
				if (value == null) {
					remove(key)
				} else {
					putString(key, value)
				}
			}.apply()
		} catch (error: Throwable) {
			Log.e(TAG, "failed to persist c15t preference", error)
		}
	}

	override fun writeDurably(key: String, value: String?): Boolean =
		try {
			val previous = prefs.getString(key, null)
			val editor = prefs.edit()
			if (value == null) editor.remove(key) else editor.putString(key, value)
			val written = editor.commit()
			if (!written) {
				// commit() changes the memory cache even when the disk write fails.
				val rollback = prefs.edit()
				if (previous == null) rollback.remove(key) else rollback.putString(key, previous)
				rollback.commit()
			}
			written
		} catch (error: Exception) {
			Log.e(TAG, "failed to persist c15t preference", error)
			false
		}

	override fun flush() {
		prefs.edit().apply()
	}

	private companion object {
		const val TAG = "c15t"
	}
}

/** Atomic, typed projection into the application-default preferences vendors read. */
internal class DefaultPreferencesTcStorageBus(private val prefs: SharedPreferences) : TcStorageBusSink {
	constructor(context: Context) : this(PreferenceManager.getDefaultSharedPreferences(context.applicationContext))

	@Synchronized
	override fun write(values: Map<String, TcBusValue>) {
		try {
			val editor = prefs.edit()
			for (key in OWNED_NAMES) {
				when (val value = values[key]) {
					is TcBusValue.NumberValue -> editor.putInt(key, value.value)
					is TcBusValue.TextValue -> editor.putString(key, value.value)
					null -> editor.remove(key)
				}
			}
			// One atomic in-memory map replacement, with a disk acknowledgement before return.
			if (!editor.commit()) throw IOException("SharedPreferences rejected IABTCF publication")
		} catch (error: Exception) {
			// commit() can update memory even when its disk write fails. Remove every grant.
			try {
				val clear = prefs.edit()
				OWNED_NAMES.forEach { clear.remove(it) }
				clear.commit()
			} catch (_: Exception) { /* Report the failure; a later publication retries. */ }
			Log.e(TAG, "failed to publish the IABTCF and IABGPP storage bus", error)
		}
	}

	override fun clear() = write(emptyMap())
	private companion object {
		const val TAG = "c15t"

		/** The `IABTCF_*` table and the `IABGPP_*` table, replaced together in one commit. */
		val OWNED_NAMES = TcStorageBusKeys.ALL_NAMES + GppStorageBusKeys.ALL_NAMES
	}
}
