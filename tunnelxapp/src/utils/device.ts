import { Platform } from 'react-native';

/**
 * Como este aparelho se apresenta quando a conta é aberta.
 *
 * Serve a UMA coisa: quando alguém tenta entrar com a conta já em uso, a recusa
 * consegue dizer *onde* ela está — "sua conta está aberta em Moto G54" em vez de
 * "em outro aparelho". A diferença é o dono reconhecer o próprio telefone e
 * saber se é ele mesmo ou não.
 *
 * Não é credencial e não participa de nenhuma decisão de acesso: quem manda é o
 * identificador de sessão, que o servidor gera. Por isso pode sair daqui sem
 * cerimônia, e por isso também não vale instalar uma biblioteca para obtê-lo —
 * `Platform.constants` já traz marca e modelo no Android.
 */
export function nomeDoAparelho(): string {
  try {
    const c: any = Platform.constants || {};

    if (Platform.OS === 'android') {
      const marca = String(c.Brand || '').trim();
      const modelo = String(c.Model || '').trim();

      // "Motorola Moto G54" — mas sem repetir a marca quando o modelo já a traz
      // ("Samsung Galaxy S23" costuma vir com Model = "SM-S911B", e aí a marca
      // ajuda; já "Xiaomi Redmi Note" viria duplicado).
      if (marca && modelo) {
        const m = modelo.toLowerCase();
        return m.startsWith(marca.toLowerCase()) ? modelo : `${marca} ${modelo}`;
      }
      if (modelo) return modelo;
      if (marca) return marca;
    }

    if (Platform.OS === 'ios') {
      const modelo = String(c.systemName || 'iPhone').trim();
      return modelo;
    }
  } catch {
    // `Platform.constants` não é garantido em toda versão/plataforma. Um nome
    // genérico é melhor que deixar o login quebrar por causa de um rótulo.
  }

  return Platform.OS === 'ios' ? 'iPhone' : 'Celular Android';
}
