/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, useColorScheme, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
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
import type { Tunnel } from './src/models/Tunnel';
import type { RootStackParamList } from './src/navigation/types';
import HeaderTitle from './src/components/HeaderTitle';
import { DotsThreeVertical } from 'phosphor-react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

enableScreens(true);

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const [initialTunnels, setInitialTunnels] = useState<Tunnel[]>([]);

  useEffect(() => {
    // Simula inicialização/carregamento de dados
    (async () => {
      const tunnels = await loadTunnels();
      setInitialTunnels(tunnels);
      setTimeout(() => setReady(true), 3000);
    })();
  }, []);

  return (
    // initialMetrics evita insets zerados no primeiro frame -- e justamente
    // nesse frame que a Splash (headerShown: false) fica 3s na tela.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
        <Stack.Navigator screenOptions={{ headerTitle: () => <HeaderTitle /> }}>
          {!ready ? (
            <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
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
              <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Definições' }} />
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
