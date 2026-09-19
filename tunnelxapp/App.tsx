/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StatusBar, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { enableScreens } from 'react-native-screens';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './src/screens/SplashScreen';
import VpnDisclosureScreen from './src/screens/VpnDisclosureScreen';
import HomeScreen from './src/screens/HomeScreen';
import TunnelDetailScreen from './src/screens/TunnelDetailScreen';
import TunnelFormScreen from './src/screens/TunnelFormScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import QRScanScreen from './src/screens/QRScanScreen';
import ConfImportScreen from './src/screens/ConfImportScreen';
import { loadTunnels } from './src/storage/tunnels';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import NewPasswordScreen from './src/screens/NewPasswordScreen';
import PlansScreen from './src/screens/PlansScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import BlockedScreen from './src/screens/BlockedScreen';
import PendingPixScreen from './src/screens/PendingPixScreen';
import ShareInviteScreen from './src/screens/ShareInviteScreen';
import {
  fetchSubscription,
  acceptShare,
  onSessionLost,
  type Access,
  type ApiPlan,
  type PendingPix,
} from './src/api/client';
import {
  loadToken,
  loadClient,
  loadMustChangePassword,
  type SessionClient,
} from './src/storage/session';
import type { Tunnel } from './src/models/Tunnel';
import type { RootStackParamList } from './src/navigation/types';
import HeaderTitle from './src/components/HeaderTitle';
import { DotsThreeVertical, QrCode } from 'phosphor-react-native';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

enableScreens(true);

/**
 * Tema claro, com o cinza do próprio logo como fundo.
 *
 * `background` precisa ser o MESMO cinza do Aurora: qualquer diferença aparece
 * como um flash na transição entre telas, justamente onde o navegador pinta o
 * próprio fundo antes de a tela montar.
 */
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function App() {
  const [ready, setReady] = useState(false);
  const [initialTunnels, setInitialTunnels] = useState<Tunnel[]>([]);
  const [client, setClient] = useState<SessionClient | null>(null);
  // Entrou com a senha do balcão: só a tela de nova senha até ele criar a dele.
  const [trocaPendente, setTrocaPendente] = useState(false);
  // Em memória e só aqui: a senha provisória não vai para o AsyncStorage, e
  // some se o app for fechado no meio (a tela então volta a pedi-la).
  const [senhaProvisoria, setSenhaProvisoria] = useState<string | undefined>();
  const [noCadastro, setNoCadastro] = useState(false);

  /*
   * Acesso provisionado: o convite lido da câmera.
   *
   * `noConvite` é a tela do leitor. `convitePendente` é o token já validado,
   * esperando uma sessão para ser aceito — quem escaneia costuma não ter conta,
   * e o aceite exige estar autenticado. Guardar o token aqui é o que permite
   * atravessar o login ou o cadastro sem perder o convite pelo caminho.
   *
   * Só em memória, de propósito: um token que sobrevivesse ao fechamento do app
   * seria aceito depois, fora do contexto, por quem talvez nem lembre de ter
   * escaneado.
   */
  const [noConvite, setNoConvite] = useState(false);
  const [convitePendente, setConvitePendente] = useState<string | null>(null);

  /*
   * Tela de assinatura aberta POR VONTADE, não por bloqueio.
   *
   * O roteamento abaixo é um funil: cada tela aparece porque a anterior negou
   * acesso. O convidado quebra isso — ele tem acesso liberado e mesmo assim
   * pode querer o plano dele, já que hoje depende de um familiar que pode
   * encerrar o compartilhamento a qualquer momento.
   *
   * Um estado à parte, e não um desvio no funil, porque a diferença é justamente
   * ter saída: destas telas dá para voltar para a Home, e das do funil não.
   */
  const [telaPropria, setTelaPropria] = useState<null | 'planos' | 'pix'>(null);

  /*
   * Quem emprestou o túnel, para a faixa da Home poder dizer o nome.
   *
   * Sai da própria lista sincronizada em vez de uma consulta nova: o nome já
   * veio junto das conexões, e um convidado tem no máximo um punhado delas.
   */
  const nomeDoTitular =
    initialTunnels.find((t) => t.origin?.shared)?.origin?.ownerName || 'um familiar';

  /*
   * Acesso pago: quem decide e o servidor.
   *
   * `access` chega pronto de /app/subscription - inclusive a carencia de 3 dias.
   * O app nao recalcula nada: duas implementacoes da mesma regra divergem no
   * primeiro ajuste, e divergir aqui significa liberar o tunel de quem parou de
   * pagar (ou bloquear quem esta em dia).
   */
  /*
   * Declaração de dados da VPN (diretriz 5.4).
   *
   * `null` = ainda lendo o disco. Precisa ser o PRIMEIRO portão depois da
   * Splash: a Apple exige a declaração antes de qualquer ação de compra ou de
   * uso do serviço, então ela vem antes do login e antes das telas de plano.
   */
  const [declaracaoAceita, setDeclaracaoAceita] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { aceitouDeclaracao } = await import('./src/storage/disclosure');
      const ok = await aceitouDeclaracao();
      if (vivo) setDeclaracaoAceita(ok);
    })();
    return () => {
      vivo = false;
    };
  }, []);


  const [acesso, setAcesso] = useState<Access | null>(null);
  const [verificandoAcesso, setVerificandoAcesso] = useState(false);
  const [planoEscolhido, setPlanoEscolhido] = useState<ApiPlan | null>(null);
  // Pix gerado e ainda nao pago: o app volta a mostrar o MESMO codigo em vez de
  // empurrar a tela de planos, que estaria bloqueada por essa mesma assinatura.
  const [pixPendente, setPixPendente] = useState<PendingPix | null>(null);

  const conferirAcesso = useCallback(async () => {
    setVerificandoAcesso(true);
    try {
      const r = await fetchSubscription();
      setPixPendente(r.pending_pix ?? null);

      /*
       * Liberado? Traz as conexões ANTES de liberar a tela.
       *
       * A ordem importa: `setAcesso` é o que monta a Home, e montá-la antes de
       * os túneis existirem no armazenamento fazia a lista nascer vazia. O
       * usuário via "nenhum túnel" logo depois de entrar, sem nada de errado no
       * servidor.
       *
       * Sincronizar também não é só cosmético aqui: quem teve a assinatura
       * ativada com o app fechado (pelo webhook, ou pelo suporte) não tem os
       * túneis no aparelho, e nada além disto vai buscá-los.
       */
      if (r.access.allowed) {
        try {
          const { syncConnections } = await import('./src/services/sync');
          const sync = await syncConnections();
          setInitialTunnels(sync.tunnels);
        } catch (e) {
          // Sincronizar enche a lista; não é o que dá acesso. Falhar aqui não
          // pode impedir o app de abrir — a Home tenta de novo ao ganhar foco.
          console.warn('[App] falha ao sincronizar conexões', e);
          setInitialTunnels(await loadTunnels());
        }
      }

      setAcesso(r.access);
    } catch (e) {
      // Sem resposta do servidor nao da para afirmar que esta liberado. Fica
      // nulo e a tela de planos assume - negar e o lado seguro do erro.
      console.warn('[App] falha ao verificar a assinatura', e);
      setAcesso(null);
    } finally {
      setVerificandoAcesso(false);
    }
  }, []);

  /*
   * A conta foi aberta em outro aparelho — ou a sessão acabou.
   *
   * Chega por uma requisição qualquer respondendo 401, em qualquer tela e sem
   * ação do usuário. Por isso o tratamento é aqui e não em cada tela: é o App
   * que consegue desfazer a sessão inteira e voltar ao login.
   *
   * `sair(true)` também tira os túneis da conta do aparelho e derruba a VPN. Um
   * aparelho desconectado que continuasse navegando pelo túnel tornaria a regra
   * de "um aparelho por vez" decorativa — é justamente o que ela impede.
   */
  useEffect(() => {
    return onSessionLost((motivo, mensagem) => {
      sair(true);
      Alert.alert(
        motivo === 'SESSION_REPLACED' ? 'Conta aberta em outro aparelho' : 'Sessão encerrada',
        mensagem
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confere ao entrar e sempre que a sessao muda.
  //
  // Segura enquanto houver convite a aceitar: sem isto o app consultaria o
  // acesso ANTES do aceite, veria "sem assinatura" e jogaria o convidado na
  // tela de planos — para depois o convite entrar e a tela mudar sozinha.
  useEffect(() => {
    if (client && !trocaPendente && !convitePendente) conferirAcesso();
  }, [client, trocaPendente, convitePendente, conferirAcesso]);

  /*
   * Aceita o convite assim que existe sessão.
   *
   * O aceite é o que cria o vínculo no servidor; antes dele o convidado não tem
   * direito a nada. Zerar `convitePendente` no fim (em qualquer desfecho)
   * destrava o efeito acima, que então consulta o acesso já com o convite valendo.
   */
  useEffect(() => {
    if (!client || trocaPendente || !convitePendente) return;

    let vivo = true;
    (async () => {
      try {
        const r = await acceptShare(convitePendente);
        if (vivo) {
          Alert.alert(
            'Acesso liberado',
            `Você entrou na conexão de ${r.share.owner_name}. ${r.share.expires_text}.`
          );
        }
      } catch (e: any) {
        // O convite pode ter expirado, sido usado por outra pessoa ou o túnel
        // ter enchido enquanto a conta era criada. A conta continua criada, e a
        // pessoa segue para a tela de planos — dizer o motivo evita que ela
        // ache que o app simplesmente ignorou o QR.
        if (vivo) Alert.alert('Convite não aceito', e?.message || 'Peça um novo QR ao titular.');
      } finally {
        if (vivo) setConvitePendente(null);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [client, trocaPendente, convitePendente]);

  useEffect(() => {
    (async () => {
      const [tunnels, token, salvo, trocar] = await Promise.all([
        loadTunnels(),
        loadToken(),
        loadClient(),
        loadMustChangePassword(),
      ]);
      setInitialTunnels(tunnels);
      // Sessão só vale com os dois: token sem perfil deixaria a Home sem saber
      // de quem são as conexões, e perfil sem token não autentica nada.
      if (token && salvo) {
        setClient(salvo);
        setTrocaPendente(trocar);

        /*
         * Rearma o vigia nativo na abertura.
         *
         * `saveSession` arma no login, mas quem já estava logado não passa
         * mais por lá — e a versão anterior do aplicativo nem tinha isto. Sem
         * este rearme, justamente a base existente ficaria sem proteção quando
         * o app sai do recents com o túnel de pé.
         */
        try {
          const { setSessionGuard } = await import('./src/services/vpnGuard');
          await setSessionGuard(token);
        } catch (e) {
          console.warn('[App] não foi possível armar o vigia nativo', e);
        }
      }
      setTimeout(() => setReady(true), 3000);
    })();
  }, []);

  const pedirNovaSenha = (c: SessionClient, provisoria: string) => {
    setSenhaProvisoria(provisoria);
    setClient(c);
    setTrocaPendente(true);
    setNoCadastro(false);
  };

  const concluirTroca = async () => {
    setSenhaProvisoria(undefined);
    setTrocaPendente(false);
    // Primeiro acesso concluído: agora o portão da assinatura decide se a
    // próxima tela é a Home ou a escolha de plano.
    await conferirAcesso();
    // Só agora o token é pleno e /app/connections responde: é aqui que os
    // túneis do cliente entram no aparelho pela primeira vez.
    try {
      const { syncConnections } = await import('./src/services/sync');
      await syncConnections();
      setInitialTunnels(await loadTunnels());
    } catch (e) {
      console.warn('[App] falha ao sincronizar após o primeiro acesso', e);
    }
  };

  const sair = async (removerTuneis: boolean) => {
    if (removerTuneis) {
      // Derruba a VPN antes de soltar os túneis: sair da conta com a conexão
      // de pé deixaria o tráfego passando por um túnel que o app não lista mais.
      try {
        const WireGuard = await import('./src/native/WireGuard');
        const vpn = await WireGuard.getVpnState();
        if (vpn.connected && vpn.tunnelId) await WireGuard.stop(vpn.tunnelId);
      } catch (e) {
        console.warn('[App] falha ao desligar a VPN ao sair', e);
      }

      const { clearSyncedTunnels } = await import('./src/services/sync');
      setInitialTunnels(await clearSyncedTunnels());
    }

    // Avisa o servidor: a conta vale em um aparelho por vez, e sem soltar a
    // sessão lá o próximo login (mesmo neste telefone) pediria confirmação para
    // desconectar um aparelho de onde a pessoa já saiu.
    const { logout } = await import('./src/api/client');
    await logout();
    setClient(null);
    setTrocaPendente(false);
    setSenhaProvisoria(undefined);
    setNoCadastro(false);
    setNoConvite(false);
    setConvitePendente(null);
    setTelaPropria(null);
    setAcesso(null);
    setPlanoEscolhido(null);
    setPixPendente(null);
  };

  return (
    // initialMetrics evita insets zerados no primeiro frame -- e justamente
    // nesse frame que a Splash (headerShown: false) fica 3s na tela.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerTitle: () => <HeaderTitle />,
            // Header sem cor de fundo e sem sombra: a aurora da tela passa por
            // baixo dele e a página vira uma peça só, em vez de uma barra
            // colada sobre um fundo diferente.
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: colors.text,
            // headerTitleStyle só aceita fonte/tamanho/peso/cor — o título em si
            // é o componente HeaderTitle.
            headerTitleStyle: { fontSize: 17, fontWeight: '700', color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          {!ready || declaracaoAceita === null ? (
            <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
          ) : !declaracaoAceita ? (
            /*
             * Declaração de dados da VPN, antes de tudo.
             *
             * A diretriz 5.4 exige a declaração "prior to any user action to
             * purchase or otherwise use the service" — por isso ela vem antes
             * do login e antes das telas de plano, e não apenas antes de ligar
             * o túnel.
             */
            <Stack.Screen name="VpnDisclosure" options={{ headerShown: false }}>
              {() => (
                <VpnDisclosureScreen
                  onAceitar={async () => {
                    const { registrarAceite } = await import('./src/storage/disclosure');
                    await registrarAceite();
                    setDeclaracaoAceita(true);
                  }}
                />
              )}
            </Stack.Screen>
          ) : !client ? (
            // Sem sessão não há o que mostrar: as conexões pertencem a uma conta.
            // A exceção é o convite: ele é lido ANTES de qualquer cadastro, para
            // a pessoa saber de quem é e por quanto tempo vale antes de decidir.
            noConvite ? (
              <Stack.Screen name="ShareInvite" options={{ headerShown: false }}>
                {() => (
                  <ShareInviteScreen
                    onEntrar={(token) => {
                      setConvitePendente(token);
                      setNoConvite(false);
                    }}
                    onCadastrar={(token) => {
                      setConvitePendente(token);
                      setNoConvite(false);
                      setNoCadastro(true);
                    }}
                    onVoltar={() => setNoConvite(false)}
                  />
                )}
              </Stack.Screen>
            ) : noCadastro ? (
              <Stack.Screen name="Register" options={{ headerShown: false }}>
                {() => (
                  <RegisterScreen
                    onCadastrado={(c) => {
                      setNoCadastro(false);
                      // Conta criada com senha própria: entra direto, sem troca
                      // obrigatória. O portão seguinte é a assinatura — que
                      // ainda não existe, então conferirAcesso leva aos planos.
                      setClient(c);
                    }}
                    onCancel={() => {
                      setNoCadastro(false);
                      // Desistiu do cadastro: o convite não pode ficar guardado
                      // para ser aceito num login futuro que não tem relação.
                      setConvitePendente(null);
                    }}
                  />
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Login" options={{ headerShown: false }}>
                {() => (
                  <LoginScreen
                    onSigned={setClient}
                    onNeedsNewPassword={pedirNovaSenha}
                    onCriarConta={() => setNoCadastro(true)}
                    onAcessoProvisionado={() => setNoConvite(true)}
                  />
                )}
              </Stack.Screen>
            )
          ) : trocaPendente ? (
            // Autenticado, mas com a senha que o operador ditou. Fica nesta tela
            // sozinha: sem Home e sem "pular" — o servidor recusaria as conexões
            // de qualquer forma, e uma tela que pode ser dispensada só adiaria a
            // descoberta para o primeiro erro.
            <Stack.Screen name="NewPassword" options={{ headerShown: false }}>
              {() => (
                <NewPasswordScreen
                  senhaAtual={senhaProvisoria}
                  onDone={concluirTroca}
                  onSessionLost={() => sair(false)}
                />
              )}
            </Stack.Screen>
          ) : planoEscolhido ? (
            // Plano escolhido: pagamento. A tela se libera sozinha quando o
            // servidor confirma — quem confirma é o webhook do Asaas.
            <Stack.Screen name="Checkout" options={{ headerShown: false }}>
              {() => (
                <CheckoutScreen
                  plano={planoEscolhido}
                  onVoltar={() => setPlanoEscolhido(null)}
                  onAtivado={async () => {
                    setPlanoEscolhido(null);
                    await conferirAcesso();
                    try {
                      const { syncConnections } = await import('./src/services/sync');
                      await syncConnections();
                      setInitialTunnels(await loadTunnels());
                    } catch (e) {
                      console.warn('[App] falha ao sincronizar após a assinatura', e);
                    }
                  }}
                />
              )}
            </Stack.Screen>
          ) : pixPendente && !acesso?.allowed ? (
            <Stack.Screen name="PendingPix" options={{ headerShown: false }}>
              {() => (
                <PendingPixScreen
                  pix={pixPendente}
                  onLiberado={async () => {
                    await conferirAcesso();
                    try {
                      const { syncConnections } = await import('./src/services/sync');
                      await syncConnections();
                      setInitialTunnels(await loadTunnels());
                    } catch (e) {
                      console.warn('[App] falha ao sincronizar após o Pix', e);
                    }
                  }}
                  onDesistir={async () => {
                    setPixPendente(null);
                    await conferirAcesso();
                  }}
                />
              )}
            </Stack.Screen>
          ) : acesso?.allowed && telaPropria === 'planos' ? (
            // Escolha de plano COM saída: quem chega aqui já tem acesso (é
            // convidado de alguém) e está só avaliando ter o próprio.
            <Stack.Screen name="Plans" options={{ headerShown: false }}>
              {() => (
                <PlansScreen
                  titulo="Tenha sua própria conexão"
                  subtitulo={
                    acesso.state === 'GUEST'
                      ? 'Hoje você usa a conexão de outra pessoa. Com um plano seu, o acesso não depende de ninguém — e você ainda pode compartilhar com a sua família.'
                      : 'Assinatura mensal, sem fidelidade. Você pode cancelar quando quiser.'
                  }
                  onEscolher={(p) => {
                    setTelaPropria(null);
                    setPlanoEscolhido(p);
                  }}
                  onVoltar={() => setTelaPropria(null)}
                />
              )}
            </Stack.Screen>
          ) : acesso?.allowed && telaPropria === 'pix' && pixPendente ? (
            <Stack.Screen name="PendingPix" options={{ headerShown: false }}>
              {() => (
                <PendingPixScreen
                  pix={pixPendente}
                  onLiberado={async () => {
                    setTelaPropria(null);
                    await conferirAcesso();
                    try {
                      const { syncConnections } = await import('./src/services/sync');
                      await syncConnections();
                      setInitialTunnels(await loadTunnels());
                    } catch (e) {
                      console.warn('[App] falha ao sincronizar após o Pix', e);
                    }
                  }}
                  // Volta para a Home, e não para os planos: o acesso do convite
                  // continua valendo e o túnel emprestado está lá.
                  onDesistir={() => setTelaPropria(null)}
                />
              )}
            </Stack.Screen>
          ) : acesso?.state === 'BLOCKED' ? (
            // Carência esgotada. Tela sem saída: o servidor já recusa as
            // conexões neste estado, então "continuar mesmo assim" só levaria a
            // uma Home vazia com erro.
            <Stack.Screen name="Blocked" options={{ headerShown: false }}>
              {() => (
                <BlockedScreen
                  access={acesso}
                  onLiberado={conferirAcesso}
                  onVerPlanos={() => setAcesso({ ...acesso, state: 'NONE', allowed: false })}
                  onSair={() => sair(false)}
                />
              )}
            </Stack.Screen>
          ) : !acesso?.allowed ? (
            // NONE, CANCELED ou PENDING: ainda não há assinatura valendo, então
            // a escolha de plano é a única tela. `verificandoAcesso` evita o
            // pisca-pisca de mostrar planos por um frame antes da resposta.
            <Stack.Screen name="Plans" options={{ headerShown: false }}>
              {() =>
                verificandoAcesso && !acesso ? (
                  <SplashScreen />
                ) : (
                  <PlansScreen
                    aviso={acesso?.message ?? null}
                    onEscolher={setPlanoEscolhido}
                    onSair={() => sair(false)}
                  />
                )
              }
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen
                name="Home"
                options={({ navigation }) => ({
                  title: 'TunnelX',
                  headerRight: () => (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Ler um convite estando logado: quem já tem conta não
                          passa mais pela tela de entrada, e sem isto o único
                          caminho para entrar na conexão de alguém seria sair
                          da própria conta. */}
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                        onPress={() => navigation.navigate('ShareInvite')}
                        accessibilityRole="button"
                        accessibilityLabel="Entrar em uma conexão compartilhada"
                      >
                        <QrCode size={20} color={colors.greenInk} weight="duotone" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                        onPress={() => navigation.navigate('Settings')}
                      >
                        <DotsThreeVertical size={20} />
                      </TouchableOpacity>
                    </View>
                  ),
                })}
              >
                {(props) => (
                  <HomeScreen
                    {...props}
                    initialTunnels={initialTunnels}
                    avisoAssinatura={acesso?.state === 'GRACE' ? acesso.message : null}
                    onResolverPagamento={conferirAcesso}
                    /* Só o convidado recebe a oferta: quem já paga um plano não
                       precisa ver convite para assinar. */
                    convidadoDe={acesso?.state === 'GUEST' ? nomeDoTitular : null}
                    onContratarPlano={() => setTelaPropria('planos')}
                    // Acesso cortado pelo titular: reavalia e deixa o roteamento
                    // levar para os planos ou para o bloqueio, conforme o caso.
                    onAcessoPerdido={conferirAcesso}
                    pagamentoPendente={acesso?.state === 'GUEST' && !!pixPendente}
                    onRetomarPagamento={() => setTelaPropria('pix')}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="TunnelDetail" component={TunnelDetailScreen} options={{ title: 'TunnelX' }} />
              <Stack.Screen name="TunnelForm" component={TunnelFormScreen} options={{ title: 'TunnelX' }} />
              <Stack.Screen name="Settings" options={{ title: 'Definições' }}>
                {(props) => <SettingsScreen {...props} client={client} onSignOut={sair} />}
              </Stack.Screen>
              <Stack.Screen
                name="ShareInvite"
                options={{ title: 'Acesso provisionado', headerShown: false }}
              >
                {({ navigation }) => (
                  <ShareInviteScreen
                    // Já autenticado: aceita na hora, sem passar por login nem
                    // cadastro. É a mesma tela, com o caminho do meio removido.
                    onAceitar={async (token) => {
                      const r = await acceptShare(token);
                      // Sincroniza ANTES de voltar: a Home recarrega do
                      // armazenamento ao ganhar foco, então o túnel novo precisa
                      // já estar lá — senão ela aparece sem ele até o próximo
                      // ciclo e parece que o convite não funcionou.
                      try {
                        const { syncConnections } = await import('./src/services/sync');
                        const sync = await syncConnections();
                        setInitialTunnels(sync.tunnels);
                      } catch (e) {
                        console.warn('[App] falha ao sincronizar após aceitar o convite', e);
                      }
                      await conferirAcesso();
                      navigation.goBack();
                      Alert.alert(
                        'Acesso liberado',
                        `Você entrou na conexão de ${r.share.owner_name}. ${r.share.expires_text}.`
                      );
                    }}
                    onVoltar={() => navigation.goBack()}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="QRScan" component={QRScanScreen} options={{ title: 'Ler QR' }} />
              <Stack.Screen name="ConfImport" component={ConfImportScreen} options={{ title: 'Importar .conf' }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
