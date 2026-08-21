package com.tunnelxapp

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.config.InetNetwork
import com.wireguard.config.InetEndpoint
import com.wireguard.crypto.Key
import java.net.InetAddress
import java.io.File
import java.util.concurrent.Executors

class StartVpnActivity : Activity() {
  companion object {
    private const val TAG = "StartVpnActivity"
    private const val REQ_PREPARE_VPN = 10001
  }

  private var tunnelId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    tunnelId = intent?.getStringExtra(TunnelXVpnService.EXTRA_TUNNEL_ID)
    if (tunnelId.isNullOrEmpty()) {
      Log.e(TAG, "onCreate: missing tunnelId, finishing")
      finish()
      return
    }

    try {
      val prepareIntent = VpnService.prepare(this)
      if (prepareIntent != null) {
        Log.d(TAG, "onCreate: launching VpnService.prepare UI")
        startActivityForResult(prepareIntent, REQ_PREPARE_VPN)
      } else {
        Log.d(TAG, "onCreate: VPN already prepared, starting service")
        startTunnelAndFinish()
      }
    } catch (e: Exception) {
      Log.e(TAG, "onCreate: error preparing VPN", e)
      finish()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == REQ_PREPARE_VPN) {
      if (resultCode == RESULT_OK) {
        Log.d(TAG, "onActivityResult: permission granted, starting service")
        startTunnelAndFinish()
      } else {
        Log.w(TAG, "onActivityResult: permission denied/canceled")
        finish()
      }
    }
  }

  private fun startTunnelAndFinish() {
    try {
      val id = tunnelId ?: return finish()
      // Lê o .conf salvo pelo módulo nativo
      val confFile = File(filesDir, "wg/$id.conf")
      if (!confFile.exists()) {
        Log.e(TAG, "startTunnelAndFinish: conf not found at ${confFile.absolutePath}")
        finish()
        return
      }

      val confText = confFile.readText()
      // Constrói Config usando a biblioteca oficial
      val cfg = buildConfigFromText(confText)
      val backend = GoBackend(application)
      val tunnel = WgTunnel(application, id)

      // Executa em thread única para evitar bloquear UI
      val exec = Executors.newSingleThreadExecutor()
      exec.execute {
        try {
          backend.setState(tunnel, Tunnel.State.UP, cfg)
          TunnelXVpnService.isActive = true
          TunnelXVpnService.currentTunnelId = id
          Log.i(TAG, "WireGuard started via GoBackend for id=${id}")
        } catch (e: Exception) {
          Log.e(TAG, "GoBackend.setState UP failed", e)
        } finally {
          runOnUiThread { finish() }
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "startTunnelAndFinish: error starting GoBackend", e)
      finish()
    }
  }

  private fun buildConfigFromText(text: String): Config {
    val ifaceBuilder = Interface.Builder()
    val peerBuilder = Peer.Builder()

    var section = ""
    text.lines().forEach { raw ->
      val line = raw.trim()
      if (line.isEmpty() || line.startsWith("#")) return@forEach
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line.lowercase()
        return@forEach
      }
      val idx = line.indexOf('=')
      if (idx <= 0) return@forEach
      val key = line.substring(0, idx).trim().lowercase()
      val value = line.substring(idx + 1).trim()

      when (section) {
        "[interface]" -> {
          when (key) {
            "privatekey" -> ifaceBuilder.parsePrivateKey(value)
            "address" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
              try { ifaceBuilder.addAddress(InetNetwork.parse(it)) } catch (_: Exception) {}
            }
            "dns" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
              try { ifaceBuilder.addDnsServer(InetAddress.getByName(it)) } catch (_: Exception) {}
            }
            "mtu" -> try { ifaceBuilder.setMtu(value.toInt()) } catch (_: Exception) {}
          }
        }
        "[peer]" -> {
          when (key) {
            "publickey" -> peerBuilder.parsePublicKey(value)
            "allowedips" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
              try { peerBuilder.addAllowedIp(InetNetwork.parse(it)) } catch (_: Exception) {}
            }
            "endpoint" -> try { peerBuilder.setEndpoint(InetEndpoint.parse(value)) } catch (_: Exception) {}
            "persistentkeepalive" -> try { peerBuilder.setPersistentKeepalive(value.toInt()) } catch (_: Exception) {}
          }
        }
      }
    }

    return Config.Builder()
      .setInterface(ifaceBuilder.build())
      .addPeer(peerBuilder.build())
      .build()
  }
}
