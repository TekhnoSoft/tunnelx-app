import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Sessão do cliente no aplicativo.
 *
 * Fica separada de `storage/tunnels.ts` de propósito: sair da conta apaga a
 * sessão, mas os túneis já importados continuam no aparelho. Quem está no meio
 * de uma viagem com a VPN de pé não pode perder a conexão porque tocou em
 * "sair" — o vínculo com a conta é uma coisa, o túnel instalado é outra.
 */

const KEY_TOKEN = 'tunnelx:token';
const KEY_CLIENT = 'tunnelx:client';
/**
 * Marca que a senha guardada ainda é a provisória do balcão.
 *
 * Persistida junto com o token porque o app pode ser fechado no meio do
 * primeiro acesso: sem isso, ao reabrir ele iria para a Home e só descobriria a
 * pendência no 403 da primeira requisição.
 */
const KEY_PENDING_PASSWORD = 'tunnelx:senha-provisoria';

/**
 * Identificador da sessão aberta por ESTE aparelho.
 *
 * Guardado à parte do token só para poder ser lido sem decodificar JWT. Serve
 * para o aparelho dizer "a sessão em uso é a minha" ao entrar de novo, e assim
 * não perguntar se ele quer desconectar a si mesmo.
 */
const KEY_SESSION = 'tunnelx:sessao';

export type SessionClient = {
  id: number;
  name: string;
  cpf: string;
  email?: string;
  whatsapp?: string;
  cidade?: string;
  uf?: string;
};

export async function saveSession(
  token: string,
  client: SessionClient,
  mustChangePassword = false,
  sessionId?: string | null
): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY_TOKEN, token],
    [KEY_CLIENT, JSON.stringify(client)],
    [KEY_PENDING_PASSWORD, mustChangePassword ? '1' : '0'],
    [KEY_SESSION, sessionId || ''],
  ]);
}

export async function loadSessionId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(KEY_SESSION)) || null;
  } catch {
    return null;
  }
}

export async function loadMustChangePassword(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_PENDING_PASSWORD)) === '1';
  } catch {
    return false;
  }
}

/**
 * Fecha o primeiro acesso: guarda o token pleno devolvido pela troca e apaga a
 * pendência. O token vem primeiro — se a gravação falhar, o app continua
 * mostrando a tela de senha, que é o estado seguro.
 */
export async function completePasswordChange(
  novoToken?: string | null,
  sessionId?: string | null
): Promise<void> {
  if (novoToken) await AsyncStorage.setItem(KEY_TOKEN, novoToken);
  if (sessionId) await AsyncStorage.setItem(KEY_SESSION, sessionId);
  await AsyncStorage.setItem(KEY_PENDING_PASSWORD, '0');
}

export async function loadToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_TOKEN);
  } catch {
    return null;
  }
}

export async function loadClient(): Promise<SessionClient | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CLIENT);
    return raw ? (JSON.parse(raw) as SessionClient) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_TOKEN, KEY_CLIENT, KEY_PENDING_PASSWORD, KEY_SESSION]);
}
