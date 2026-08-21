package com.tunnelxapp

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

/**
 * Fonte unica de emissao de status de VPN para o JS.
 *
 * As emissoes anteriores usavam `reactNativeHost.reactInstanceManager.currentReactContext`
 * (API do bridge legado) enquanto o app roda em bridgeless / Nova Arquitetura do RN 0.82,
 * e a falha era engolida num warning. Aqui usamos o proprio ReactApplicationContext que o
 * modulo nativo ja possui, que e valido nas duas arquiteturas.
 */
object VpnStatus {
  const val EVENT = "TunnelXVpnStatus"
  private const val TAG = "VpnStatus"

  @Volatile private var ctxRef: WeakReference<ReactContext>? = null
  @Volatile private var last: String = "disconnected"

  fun attach(ctx: ReactContext) {
    ctxRef = WeakReference(ctx)
  }

  fun lastState(): String = last

  /** state: "connected" | "disconnected" | "error" */
  fun emit(state: String, tunnelId: String?, message: String?) {
    last = state
    val ctx = ctxRef?.get()
    if (ctx == null || !ctx.hasActiveReactInstance()) {
      Log.w(TAG, "emit($state): sem ReactContext ativo; estado guardado para o proximo pull")
      return
    }
    try {
      val payload = Arguments.createMap().apply {
        putString("state", state)
        putString("tunnelId", tunnelId)
        putString("message", message)
      }
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT, payload)
      Log.d(TAG, "emit: state=$state tunnelId=$tunnelId")
    } catch (t: Throwable) {
      Log.w(TAG, "emit falhou", t)
    }
  }
}
