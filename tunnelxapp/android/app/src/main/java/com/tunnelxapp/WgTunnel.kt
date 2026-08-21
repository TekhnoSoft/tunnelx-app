package com.tunnelxapp

import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.wireguard.android.backend.Tunnel

class WgTunnel(
  private val app: android.app.Application,
  private val name: String = "tunnelx"
) : Tunnel {
  companion object {
    private const val TAG = "WgTunnel"
    const val STATUS_EVENT = "TunnelXVpnStatus"
  }

  override fun getName(): String = name

  override fun onStateChange(state: Tunnel.State) {
    try {
      val connected = state == Tunnel.State.UP
      emitStatus(connected)
      Log.d(TAG, "onStateChange: ${state}")
      TunnelXVpnService.isActive = connected
      TunnelXVpnService.currentTunnelId = if (connected) TunnelXVpnService.currentTunnelId else null
    } catch (e: Exception) {
      Log.w(TAG, "onStateChange: failed to emit status", e)
    }
  }

  private fun emitStatus(connected: Boolean) {
    try {
      val reactApp = app as? ReactApplication ?: return
      val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext ?: return
      val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      emitter.emit(STATUS_EVENT, if (connected) "connected" else "disconnected")
    } catch (e: Exception) {
      Log.w(TAG, "emitStatus: failed", e)
    }
  }
}