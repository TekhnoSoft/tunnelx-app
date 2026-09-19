package com.tunnelxapp

import android.content.Context
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

/**
 * Confere, do lado nativo, se este aparelho ainda pode usar o tunel.
 *
 * Existe por causa de um buraco que so aparece quando o app NAO esta na frente.
 *
 * O TunnelKeepAliveService mantem o tunel de pe depois que o usuario tira o app
 * do recents - e esse e o objetivo dele. Mas nesse estado nao ha JavaScript
 * rodando: o vigia de acesso em services/accessWatch.ts para junto com a tela.
 * Resultado: a conta e aberta em outro aparelho, o servidor derruba esta sessao,
 * e este telefone segue roteando trafego por um tunel que ninguem mais autoriza
 * - sem tela para avisar e sem nada para desligar.
 *
 * Quem mantem o tunel vivo precisa ser quem verifica se ele ainda vale. Por isso
 * a checagem mora aqui, em Kotlin, alcancavel pelo servico e independente do
 * ciclo de vida do React.
 *
 * As credenciais chegam pelo JS (WireGuardModule.setSessionGuard) e ficam em
 * SharedPreferences: o servico precisa delas sem poder perguntar a ninguem.
 */
object SessionGuard {

  private const val TAG = "SessionGuard"
  private const val PREFS = "tunnelx_session_guard"
  private const val KEY_BASE_URL = "base_url"
  private const val KEY_TOKEN = "token"

  /** Rota mais barata que o servidor oferece: resumo, sem as configuracoes. */
  private const val ROTA = "/app/connections/state"

  private const val TIMEOUT_MS = 15000

  /**
   * O que a conferencia concluiu.
   *
   * `DESCONHECIDO` e o caso mais importante de respeitar: sem rede, servidor
   * fora do ar, DNS falhando. Derrubar a VPN nessas horas transformaria uma
   * oscilacao de sinal - ou um tunel que ainda nao terminou de subir - em perda
   * de acesso. So `NEGADO` desliga alguma coisa.
   */
  enum class Resultado { AUTORIZADO, NEGADO, DESCONHECIDO }

  private fun prefs(ctx: Context) =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Guarda o que o servico precisa para perguntar ao servidor. */
  fun configurar(ctx: Context, baseUrl: String?, token: String?) {
    prefs(ctx).edit()
      .putString(KEY_BASE_URL, baseUrl?.trimEnd('/'))
      .putString(KEY_TOKEN, token)
      .apply()
    Log.i(TAG, "configurar: credenciais ${if (token.isNullOrBlank()) "limpas" else "gravadas"}")
  }

  fun limpar(ctx: Context) = configurar(ctx, null, null)

  fun temCredenciais(ctx: Context): Boolean {
    val p = prefs(ctx)
    return !p.getString(KEY_TOKEN, null).isNullOrBlank() &&
      !p.getString(KEY_BASE_URL, null).isNullOrBlank()
  }

  /**
   * Pergunta ao servidor se este token ainda vale. Bloqueante - chamar fora da
   * thread principal.
   *
   * Dois codigos desligam o tunel, e por razoes diferentes:
   *
   *   401  a sessao nao e mais desta maquina. Ou a conta foi aberta em outro
   *        aparelho, ou houve logout, ou o token e de antes da sessao unica.
   *
   *   402  a conta existe mas perdeu o direito: assinatura vencida alem da
   *        carencia, ou o titular removeu este convidado do tunel dele.
   *
   * Qualquer outra resposta - inclusive 500 - e DESCONHECIDO. Um servidor com
   * defeito nao pode desconectar a base inteira de clientes.
   */
  fun verificar(ctx: Context): Resultado {
    val p = prefs(ctx)
    val base = p.getString(KEY_BASE_URL, null)
    val token = p.getString(KEY_TOKEN, null)

    if (base.isNullOrBlank() || token.isNullOrBlank()) {
      // Sem credenciais nao ha o que afirmar. Nao e negacao: tunel importado a
      // mao por arquivo ou QR nao pertence a conta nenhuma e continua valendo.
      return Resultado.DESCONHECIDO
    }

    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(base + ROTA).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
      }

      when (val codigo = conn.responseCode) {
        401, 402 -> {
          Log.w(TAG, "verificar: acesso negado pelo servidor (HTTP $codigo)")
          Resultado.NEGADO
        }
        in 200..299 -> Resultado.AUTORIZADO
        else -> {
          Log.i(TAG, "verificar: resposta inconclusiva (HTTP $codigo)")
          Resultado.DESCONHECIDO
        }
      }
    } catch (t: Throwable) {
      // Sem rede, DNS fora, tunel ainda subindo. Silencioso de proposito.
      Log.i(TAG, "verificar: nao foi possivel falar com o servidor: ${t.message}")
      Resultado.DESCONHECIDO
    } finally {
      try {
        conn?.disconnect()
      } catch (_: Throwable) {
      }
    }
  }
}
