package com.tunnelxapp.wireguard

import android.os.ParcelFileDescriptor
import android.util.Log

class WgEngineGo : WgEngine {
  companion object {
    private const val TAG = "WgEngineGo"
    private var libLoaded = false
    init {
      try {
        System.loadLibrary("wg-go")
        libLoaded = true
        Log.d(TAG, "Loaded libwg-go")
      } catch (e: Throwable) {
        libLoaded = false
        Log.w(TAG, "libwg-go not loaded: ${e.message}")
      }
    }
  }

  override fun start(tunPfd: ParcelFileDescriptor, confText: String): Boolean {
    if (!libLoaded) {
      Log.w(TAG, "start: libwg-go missing, cannot start engine")
      return false
    }
    return try {
      nativeStart(tunPfd, confText)
    } catch (e: Throwable) {
      Log.e(TAG, "nativeStart failed", e)
      false
    }
  }

  override fun stop(): Boolean {
    if (!libLoaded) return false
    return try {
      nativeStop()
    } catch (e: Throwable) {
      Log.e(TAG, "nativeStop failed", e)
      false
    }
  }

  private external fun nativeStart(tunPfd: ParcelFileDescriptor, confText: String): Boolean
  private external fun nativeStop(): Boolean
}