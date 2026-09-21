# Resposta à App Review — funcionalidade VPN

Cole o bloco **EN** na resposta da mensagem e também em **App Information →
App Review Information → Notes**.

---

## EN — para colar

**1. What user information does the app collect using the VPN?**

None. TunnelX sells internet access; the tunnel is how that access reaches the
customer's device. It is not a privacy or anonymization product.

- The packet tunnel extension (`TunnelXVPN`) receives the WireGuard
  configuration and forwards packets. It never inspects, records, or transmits
  traffic content, URLs, or DNS queries. Its `PrivacyInfo.xcprivacy` declares an
  empty `NSPrivacyCollectedDataTypes`.
- The app contains no analytics, attribution, advertising, or crash-reporting
  SDK. `NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains` is empty in
  both the app and the extension.
- The tunnel uses Google Public DNS (`8.8.8.8`). We run no DNS resolver, so we
  have no ability to log queries.

Everything in our Privacy Nutrition Label comes from the sign-up form, not from
the tunnel.

The WireGuard server keeps only the operational metadata the protocol requires
to route a session, per registered device: the device's public key, the source
IP and port of the last authenticated packet, the last handshake timestamp, and
byte counters. It is read live from the running tunnel and is not written to our
database.

**2. For what purposes is this information collected?**

Operating the service the customer paid for:

1. Provision one WireGuard peer per device and route the customer's access.
2. Apply the purchased plan: how many devices it allows, guest access shared by
   the account holder, and the expiry of that access.
3. Support: let our staff see whether a device is currently connected.

No advertising, profiling, audience building, or tracking of any kind.

**3. Will the data be shared with third parties?**

No. No data obtained through the VPN is shared with anyone, because none is
collected from it. There are no analytics providers, advertising networks, or
data brokers in the app, and no traffic data is sold or transferred.

Account data is stored on our own servers in ⟨país / provedor⟩.

Privacy policy: https://tunnelx.com.br/politica-de-privacidade.html

---

## PT — mesma resposta

**1. Quais informações do usuário o aplicativo coleta usando VPN?**

Nenhuma. A TunnelX vende acesso à internet; o túnel é o meio de entregar esse
acesso ao aparelho do cliente. Não é um produto de privacidade ou anonimato.

- A extensão de túnel (`TunnelXVPN`) recebe a configuração WireGuard e
  encaminha pacotes. Nunca inspeciona, registra nem transmite conteúdo de
  tráfego, URLs ou consultas DNS. O `PrivacyInfo.xcprivacy` dela declara
  `NSPrivacyCollectedDataTypes` vazio.
- O aplicativo não contém SDK de análise, atribuição, publicidade ou relatório
  de falhas. `NSPrivacyTracking` é `false` e `NSPrivacyTrackingDomains` está
  vazio, no app e na extensão.
- O túnel usa o DNS público do Google (`8.8.8.8`). Não operamos resolvedor DNS,
  portanto não temos como registrar consultas.

Tudo o que consta no rótulo de privacidade vem do formulário de cadastro, não do
túnel.

O servidor WireGuard mantém apenas os metadados operacionais que o protocolo
exige para rotear uma sessão, por aparelho cadastrado: chave pública do
aparelho, IP e porta de origem do último pacote autenticado, horário do último
handshake e contadores de bytes. São lidos ao vivo do túnel em execução e não
são gravados no nosso banco.

**2. Para quais finalidades você está coletando essas informações?**

Operar o serviço que o cliente contratou:

1. Provisionar um peer WireGuard por aparelho e rotear o acesso.
2. Aplicar o plano contratado: quantos aparelhos permite, o acesso de convidado
   compartilhado pelo titular e o prazo desse acesso.
3. Atendimento: permitir que o suporte veja se o aparelho está conectado.

Não há publicidade, perfilamento, formação de audiência nem rastreamento.

**3. Os dados serão compartilhados com terceiros?**

Não. Nenhum dado obtido pela VPN é compartilhado com ninguém, porque nada é
coletado dela. Não há provedores de análise, redes de publicidade nem corretores
de dados no aplicativo, e nenhum dado de tráfego é vendido ou transferido.

Os dados de cadastro ficam em servidores próprios em ⟨país / provedor⟩.

Política de privacidade: https://tunnelx.com.br/politica-de-privacidade.html

---

## Antes de enviar

- [ ] Preencher ⟨país / provedor⟩ nos dois blocos.
- [ ] Conferir que `https://tunnelx.com.br/politica-de-privacidade.html` abre
      **sem login** e diz, por escrito, que o tráfego do túnel não é registrado,
      vendido nem compartilhado. A diretriz 5.4 exige essa frase, e o revisor
      abre o link.
- [ ] Colar a mesma resposta em **App Review Information → Notes**, como a
      mensagem pede.
