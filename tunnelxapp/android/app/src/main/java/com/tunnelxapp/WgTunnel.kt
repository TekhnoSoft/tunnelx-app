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
      // Callback do backend: apenas REFLETE, nunca decide. O dono do estado e o VpnManager.
      if (!connected) {
        TunnelXVpnService.isActive = false
        TunnelXVpnService.currentTunnelId = null
      }
    } catch (e: Exception) {
      Log.w(TAG, "onStateChange: failed to emit status", e)
    }
  }

  // Delega para o VpnStatus: a emissao antiga usava reactInstanceManager (bridge legado),
  // invalido em bridgeless, e a falha era engolida num warning.
  private fun emitStatus(connected: Boolean) {
    VpnStatus.emit(if (connected) "connected" else "disconnected", name, null)
  }
}