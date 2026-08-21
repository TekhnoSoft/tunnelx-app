package com.tunnelxapp

import android.app.Activity
import android.os.Bundle
import android.util.Log
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel

class StopVpnActivity : Activity() {
  companion object {
    private const val TAG = "StopVpnActivity"
  }

  private var tunnelId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    tunnelId = intent?.getStringExtra(TunnelXVpnService.EXTRA_TUNNEL_ID)
    if (tunnelId.isNullOrEmpty()) {
      Log.w(TAG, "onCreate: missing tunnelId, finishing")
      finish()
      return
    }
    try {
      val backend = GoBackend(application)
      val tunnel = WgTunnel(application, tunnelId!!)
      // DOWN não requer Config
      backend.setState(tunnel, Tunnel.State.DOWN, null)
      TunnelXVpnService.isActive = false
      TunnelXVpnService.currentTunnelId = null
      Log.i(TAG, "WireGuard stopped via GoBackend for id=${tunnelId}")
    } catch (e: Exception) {
      Log.e(TAG, "onCreate: error stopping GoBackend", e)
    } finally {
      finish()
    }
  }
}
