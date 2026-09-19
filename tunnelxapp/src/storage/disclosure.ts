import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Aceite da declaração de dados da VPN.
 *
 * A diretriz 5.4 exige que um app de VPN mostre, EM UMA TELA DO APP, o que
 * coleta e como usa, antes de qualquer ação de compra ou de uso do serviço.
 * Guardar o aceite aqui é o que evita repetir a tela a cada abertura.
 *
 * Fica separado da sessão de propósito: o aceite é do aparelho e sobrevive a
 * sair da conta. Quem já leu não precisa ler de novo ao trocar de login, e
 * limpar a sessão não pode reabrir a tela no meio de um fluxo.
 */
const KEY = 'tunnelx:declaracao-vpn';

/** Versão do texto aceito. Subir isto reapresenta a tela a quem já aceitou. */
export const VERSAO_DECLARACAO = '1';

export async function aceitouDeclaracao(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === VERSAO_DECLARACAO;
  } catch {
    // Storage indisponível: mostrar de novo é o lado seguro do erro.
    return false;
  }
}

export async function registrarAceite(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, VERSAO_DECLARACAO);
  } catch {
    // Falhar aqui só faz a tela reaparecer na próxima abertura.
  }
}
