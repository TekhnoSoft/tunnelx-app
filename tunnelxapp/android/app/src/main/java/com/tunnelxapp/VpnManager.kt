package com.tunnelxapp

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.util.concurrent.Executors

/**
 * Dono unico do ciclo de vida da VPN.
 *
 * Motivo de existir: antes, WireGuardModule.start criava GoBackend e WgTunnel como
 * variaveis LOCAIS e as descartava, e StopVpnActivity criava OUTRO par para pedir DOWN.
 * O GoBackend rastreia o tunel ativo em campo de instancia e descarta setState(DOWN)
 * quando currentTunnel != tunnel ("bogus call") -- entao wgTurnOff nunca rodava e o TUN
 * com rota 0.0.0.0/0 ficava instalado ate a morte do processo, derrubando Wi-Fi e dados
 * moveis ao mesmo tempo.
 *
 * Aqui existe UM GoBackend e UM WgTunnel por processo, e todas as transicoes passam por
 * um executor serial (nunca duas operacoes concorrentes sobre o mesmo TUN).
 */
object VpnManager {
  private const val TAG = "VpnManager"

  private val io = Executors.newSingleThreadExecutor { r ->
    Thread(r, "vpn-manager").apply { isDaemon = true }
  }

  @Volatile private var backend: GoBackend? = null
  @Volatile private var tunnel: WgTunnel? = null
  @Volatile private var activeId: String? = null

  fun submit(task: () -> Unit) {
    io.execute(task)
  }

  private fun backend(ctx: Context): GoBackend = synchronized(this) {
    backend ?: GoBackend(ctx.applicationContext).also { backend = it }
  }

  private fun tunnelFor(ctx: Context, id: String): WgTunnel = synchronized(this) {
    val cur = tunnel
    if (cur != null && cur.getName() == id) {
      cur
    } else {
      WgTunnel(ctx.applicationContext as Application, id).also { tunnel = it }
    }
  }

  /** Sobe o tunel. Lanca em qualquer falha -- e nunca deixa TUN meio-montado (ver finally). */
  @Throws(Exception::class)
  fun startBlocking(ctx: Context, id: String, cfg: Config) {
    if (VpnService.prepare(ctx.applicationContext) != null) {
      throw IllegalStateException("E_NEEDS_PREPARE")
    }

    // Troca de tunel: derruba o anterior ANTES de subir o novo.
    // A lib so admite um userspace tunnel por vez.
    val previous = activeId
    if (previous != null && previous != id) {
      Log.i(TAG, "startBlocking: trocando de tunel $previous -> $id, derrubando o anterior")
      stopBlocking(ctx)
    }

    var ok = false
    try {
      backend(ctx).setState(tunnelFor(ctx, id), Tunnel.State.UP, cfg)
      ok = true
      activeId = id
      TunnelXVpnService.isActive = true
      TunnelXVpnService.currentTunnelId = id
      VpnStatus.emit("connected", id, null)
      Log.i(TAG, "startBlocking: tunel UP id=$id")
    } finally {
      // Se o setState lancou no meio (ex.: establish() ok mas wgTurnOn falhou),
      // nao pode sobrar interface de pe -- seria exatamente o blackhole.
      if (!ok) {
        Log.e(TAG, "startBlocking: falhou, executando teardown defensivo")
        try {
          stopBlocking(ctx)
        } catch (t: Throwable) {
          Log.w(TAG, "teardown defensivo falhou", t)
        }
      }
    }
  }

  /**
   * Teardown IDEMPOTENTE e a prova de excecao. Pode ser chamado N vezes, de qualquer
   * thread, com ou sem tunel ativo. O bloco finally e o que garante que o TUN morre
   * mesmo se a engine explodir ou se o setState for descartado pela lib.
   */
  fun stopBlocking(ctx: Context) {
    val app = ctx.applicationContext
    try {
      val b = backend
      val t = tunnel
      if (b != null && t != null) {
        b.setState(t, Tunnel.State.DOWN, null)
        Log.i(TAG, "stopBlocking: setState(DOWN) concluido para ${t.getName()}")
      } else {
        Log.w(TAG, "stopBlocking: sem backend/tunnel em memoria, indo direto ao fallback")
      }
    } catch (t: Throwable) {
      Log.w(TAG, "stopBlocking: setState(DOWN) falhou -- o fallback assume", t)
    } finally {
      // FALLBACK DURO: destruir o VpnService dono do descritor. O onDestroy da lib
      // chama wgTurnOff e o sistema desmonta a interface. Idempotente: stopService
      // sobre servico ja morto e no-op.
      try {
        app.stopService(Intent(app, GoBackend.VpnService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "stopService(GoBackend.VpnService) falhou", t)
      }
      try {
        app.stopService(Intent(app, TunnelXVpnService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "stopService(TunnelXVpnService) falhou", t)
      }

      activeId = null
      tunnel = null
      TunnelXVpnService.isActive = false
      TunnelXVpnService.currentTunnelId = null
      VpnStatus.emit("disconnected", null, null)
      Log.i(TAG, "stopBlocking: teardown concluido")
    }
  }

  /** Verdade do backend, nao flag manual. */
  fun isUp(): Boolean {
    val b = backend ?: return false
    val t = tunnel ?: return false
    return try {
      b.getState(t) == Tunnel.State.UP
    } catch (e: Throwable) {
      Log.w(TAG, "isUp: getState falhou", e)
      false
    }
  }

  fun activeTunnelId(): String? = activeId
}
