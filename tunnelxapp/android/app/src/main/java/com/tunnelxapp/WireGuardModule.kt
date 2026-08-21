package com.tunnelxapp

import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.net.InetAddress
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.config.InetNetwork
import com.wireguard.config.InetEndpoint

class WireGuardModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val TAG = "WireGuardModule"
  }
  override fun getName(): String = "WireGuardModule"

  @ReactMethod
  fun applyConfig(params: ReadableMap, promise: Promise) {
    try {
      val id = params.getString("id") ?: return promise.reject("EINVAL", "Missing id")
      val conf = params.getString("conf") ?: return promise.reject("EINVAL", "Missing conf")
      val dir = File(reactContext.filesDir, "wg")
      if (!dir.exists()) dir.mkdirs()
      val file = File(dir, "$id.conf")
      file.writeText(conf)
      Log.d(TAG, "applyConfig: wrote conf id=$id path=${file.absolutePath} length=${conf.length}")
      promise.resolve(null)
    } catch (e: Exception) {
      Log.e(TAG, "applyConfig: error writing conf", e)
      promise.reject("EWRITE", "Failed to write WireGuard config", e)
    }
  }

  @ReactMethod
  fun start(id: String, promise: Promise) {
    try {
      // Check for permissions
      val intent = VpnService.prepare(reactContext)
      if (intent != null) {
         promise.reject("E_NEEDS_PREPARE", "VPN permission not granted")
         return
      }

      val confFile = File(reactContext.filesDir, "wg/$id.conf")
      if (!confFile.exists()) {
        promise.reject("ECONF", "Config file not found")
        return
      }
      
      val confText = confFile.readText()
      val cfg: Config
      try {
        cfg = buildConfigFromText(confText)
      } catch (e: Exception) {
        promise.reject("EPARSE", "Failed to parse config: ${e.message}")
        return
      }

      val app = reactContext.applicationContext as android.app.Application
      val backend = GoBackend(app)
      val tunnel = WgTunnel(app, id)

      // Run in background thread
      Thread {
         try {
             backend.setState(tunnel, Tunnel.State.UP, cfg)
             TunnelXVpnService.isActive = true
             TunnelXVpnService.currentTunnelId = id
             Log.i(TAG, "WireGuard started via GoBackend for id=${id}")
             reactContext.runOnJSQueueThread { promise.resolve(null) }
         } catch (e: Exception) {
             Log.e(TAG, "start failed", e)
             reactContext.runOnJSQueueThread { promise.reject("ESTART", e.message ?: "Failed to start tunnel") }
         }
      }.start()

    } catch (e: Exception) {
      Log.e(TAG, "start: error starting tunnel id=$id", e)
      promise.reject("ESTART", "Failed to start tunnel", e)
    }
  }

  private fun buildConfigFromText(text: String): Config {
    val ifaceBuilder = Interface.Builder()
    var peerBuilder: Peer.Builder? = null
    val peers = mutableListOf<Peer>()

    var section = ""
    text.lines().forEach { raw ->
      val line = raw.trim()
      if (line.isEmpty() || line.startsWith("#")) return@forEach
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line.lowercase()
        if (section == "[peer]") {
           if (peerBuilder != null) {
             peers.add(peerBuilder!!.build())
           }
           peerBuilder = Peer.Builder()
        }
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
          if (peerBuilder != null) {
            when (key) {
              "publickey" -> peerBuilder!!.parsePublicKey(value)
              "allowedips" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
                try { peerBuilder!!.addAllowedIp(InetNetwork.parse(it)) } catch (_: Exception) {}
              }
              "endpoint" -> try { peerBuilder!!.setEndpoint(InetEndpoint.parse(value)) } catch (_: Exception) {}
              "persistentkeepalive" -> try { peerBuilder!!.setPersistentKeepalive(value.toInt()) } catch (_: Exception) {}
              "presharedkey" -> try { peerBuilder!!.parsePreSharedKey(value) } catch (_: Exception) {}
            }
          }
        }
      }
    }
    // Add last peer
    if (peerBuilder != null) {
      peers.add(peerBuilder!!.build())
    }

    val builder = Config.Builder()
      .setInterface(ifaceBuilder.build())
    
    peers.forEach { builder.addPeer(it) }
    
    return builder.build()
  }

  @ReactMethod
  fun stop(id: String, promise: Promise) {
    try {
      // Solicita parada do serviço VpnService (se estiver em uso)
      try {
        val serviceIntent = Intent(reactContext, TunnelXVpnService::class.java).apply {
          action = TunnelXVpnService.ACTION_STOP_TUNNEL
        }
        reactContext.stopService(serviceIntent)
      } catch (_: Exception) { /* ignore */ }
      // Para túneis iniciados via GoBackend, dispara Activity de parada
      val stopIntent = Intent(reactContext, StopVpnActivity::class.java).apply {
        putExtra(TunnelXVpnService.EXTRA_TUNNEL_ID, id)
      }
      val activity = reactContext.currentActivity
      if (activity != null) {
        activity.startActivity(stopIntent)
      } else {
        stopIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(stopIntent)
      }
      Log.d(TAG, "stop: launched StopVpnActivity and requested service stop for id=$id")
      promise.resolve(null)
    } catch (e: Exception) {
      Log.e(TAG, "stop: error stopping tunnel id=$id", e)
      promise.reject("ESTOP", "Failed to stop tunnel", e)
    }
  }

  @ReactMethod
  fun status(id: String, promise: Promise) {
    // Placeholder until real status is wired from service/native WG
    val active = TunnelXVpnService.isActive && TunnelXVpnService.currentTunnelId == id
    val result = if (active) "up" else "down"
    Log.d(TAG, "status: id=$id => $result")
    promise.resolve(result)
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    try {
      promise.resolve(TunnelXVpnService.isActive)
    } catch (e: Exception) {
      Log.e(TAG, "isConnected: failed", e)
      promise.reject("ESTATUS", "Failed to get tunnel status", e)
    }
  }

  // Optional helper: initiate VpnService.prepare flow from current Activity
  @ReactMethod
  fun prepareVpn(promise: Promise) {
    val current = reactContext.currentActivity
    try {
      if (current != null) {
        val intent = VpnService.prepare(current)
        if (intent == null) {
          // Already prepared
          Log.d(TAG, "prepareVpn: already prepared via Activity context")
          promise.resolve(true)
          return
        }
        // Use startActivityForResult to reliably show permission UI on all OEMs
        current.startActivityForResult(intent, 10001)
        Log.d(TAG, "prepareVpn: launched prepare via Activity context")
        promise.resolve(true)
        return
      }

      // Fallback: use application context with NEW_TASK flag
      val appIntent = VpnService.prepare(reactContext)
      if (appIntent == null) {
        Log.d(TAG, "prepareVpn: already prepared via App context")
        promise.resolve(true)
        return
      }
      appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(appIntent)
      Log.d(TAG, "prepareVpn: launched prepare via App context")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e(TAG, "prepareVpn: error launching prepare", e)
      promise.reject("EPREP", "Failed to start VPN prepare activity", e)
    }
  }
}
