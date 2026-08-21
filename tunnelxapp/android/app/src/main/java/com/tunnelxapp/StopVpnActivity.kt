package com.tunnelxapp

import android.app.Activity
import android.os.Bundle
import android.util.Log

class StopVpnActivity : Activity() {
  companion object {
    private const val TAG = "StopVpnActivity"
  }

  private var tunnelId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // tunnelId e apenas informativo: o teardown e global e idempotente.
    tunnelId = intent?.getStringExtra(TunnelXVpnService.EXTRA_TUNNEL_ID)

    // Esta Activity virou um atalho externo (ex.: acao de notificacao) que DELEGA ao
    // dono real. Nunca mais instanciar GoBackend aqui: DOWN pedido numa instancia
    // diferente da que subiu o tunel e descartado pela lib como "bogus call", e era
    // exatamente isso que deixava o TUN de pe apos o usuario desligar o switch.
    val app = applicationContext
    Log.i(TAG, "onCreate: delegando teardown ao VpnManager id=$tunnelId")
    VpnManager.submit {
      try {
        VpnManager.stopBlocking(app)
      } catch (t: Throwable) {
        Log.e(TAG, "onCreate: teardown falhou", t)
      }
    }
    finish()
  }
}
