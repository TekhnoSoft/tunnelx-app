/**
 * Endereços dos documentos legais.
 *
 * Fonte única: estas URLs aparecem na tela de declaração de dados e nos
 * Ajustes, e a da política vai também no campo "Privacy Policy URL" do App
 * Store Connect. Duplicadas em cada tela, divergiriam no primeiro ajuste — e
 * um link quebrado na revisão é reprovação.
 *
 * Requisitos que o revisor da Apple confere:
 *  - abrem SEM login;
 *  - a política declara explicitamente que o tráfego do túnel não é
 *    registrado, vendido nem compartilhado (exigência da diretriz 5.4 para
 *    apps de VPN);
 *  - o que está escrito ali bate com `PrivacyInfo.xcprivacy` e com o rótulo
 *    de privacidade da ficha.
 */

const SITE = 'https://tunnelx.com.br';

export const URL_PRIVACIDADE = `${SITE}/politica-de-privacidade.html`;

/**
 * Termos de uso.
 *
 * Vazio de propósito enquanto a página não existir: a tela esconde o item em
 * vez de oferecer um link que devolve 404 para o revisor. Basta preencher para
 * ele voltar a aparecer.
 */
export const URL_TERMOS = '';
