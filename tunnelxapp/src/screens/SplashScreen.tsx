import React from 'react';
import { Image, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SplashScreen() {
  return (
    // Unica tela registrada com headerShown: false, portanto a unica responsavel
    // pelo proprio inset de topo. As demais recebem isso do header nativo.
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Image source={require('../../splash.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="small" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 200, height: 200, marginBottom: 24 },
});