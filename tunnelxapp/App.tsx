/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { enableScreens } from 'react-native-screens';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './src/screens/SplashScreen';
import HomeScreen from './src/screens/HomeScreen';
import TunnelDetailScreen from './src/screens/TunnelDetailScreen';
import TunnelFormScreen from './src/screens/TunnelFormScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import QRScanScreen from './src/screens/QRScanScreen';
import ConfImportScreen from './src/screens/ConfImportScreen';
import { loadTunnels } from './src/storage/tunnels';
import LoginScreen from './src/screens/LoginScreen';
import FirstAccessScreen from './src/screens/FirstAccessScreen';
import NewPasswordScreen from './src/screens/NewPasswordScreen';
import {
  loadToken,
  loadClient,
  loadMustChangePassword,
  clearSession,
  type SessionClient,
} from './src/storage/session';
import type { Tunnel } from './src/models/Tunnel';
import type { RootStackParamList } from './src/navigation/types';
import HeaderTitle from './src/components/HeaderTitle';
import { DotsThreeVertical } from 'phosphor-react-native';
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
  const [noPrimeiroAcesso, setNoPrimeiroAcesso] = useState(false);

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
      }
      setTimeout(() => setReady(true), 3000);
    })();
  }, []);

  const pedirNovaSenha = (c: SessionClient, provisoria: string) => {
    setSenhaProvisoria(provisoria);
    setClient(c);
    setTrocaPendente(true);
    setNoPrimeiroAcesso(false);
  };

  const concluirTroca = async () => {
    setSenhaProvisoria(undefined);
    setTrocaPendente(false);
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
      const { clearSyncedTunnels } = await import('./src/services/sync');
      setInitialTunnels(await clearSyncedTunnels());
    }
    await clearSession();
    setClient(null);
    setTrocaPendente(false);
    setSenhaProvisoria(undefined);
    setNoPrimeiroAcesso(false);
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
          {!ready ? (
            <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
          ) : !client ? (
            // Sem sessão não há o que mostrar: as conexões pertencem a uma conta.
            noPrimeiroAcesso ? (
              <Stack.Screen name="FirstAccess" options={{ headerShown: false }}>
                {() => (
                  <FirstAccessScreen
                    onNeedsNewPassword={pedirNovaSenha}
                    onSigned={setClient}
                    onCancel={() => setNoPrimeiroAcesso(false)}
                  />
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Login" options={{ headerShown: false }}>
                {() => (
                  <LoginScreen
                    onSigned={setClient}
                    onNeedsNewPassword={pedirNovaSenha}
                    onFirstAccess={() => setNoPrimeiroAcesso(true)}
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
          ) : (
            <>
              <Stack.Screen
                name="Home"
                options={({ navigation }) => ({
                  title: 'TunnelX',
                  headerRight: () => (
                    <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 6 }} onPress={() => navigation.navigate('Settings')}>
                      <DotsThreeVertical size={20} />
                    </TouchableOpacity>
                  ),
                })}
              >
                {(props) => <HomeScreen {...props} initialTunnels={initialTunnels} />}
              </Stack.Screen>
              <Stack.Screen name="TunnelDetail" component={TunnelDetailScreen} options={{ title: 'TunnelX' }} />
              <Stack.Screen name="TunnelForm" component={TunnelFormScreen} options={{ title: 'TunnelX' }} />
              <Stack.Screen name="Settings" options={{ title: 'Definições' }}>
                {(props) => <SettingsScreen {...props} client={client} onSignOut={sair} />}
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
