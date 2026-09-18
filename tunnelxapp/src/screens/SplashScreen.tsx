import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Aurora from '../components/Aurora';
import { colors, spacing, type } from '../theme';

export default function SplashScreen() {
  const entrada = useRef(new Animated.Value(0)).current;
  const varredura = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A marca sobe e materializa em vez de aparecer pronta: a Splash fica 3s na
    // tela e um logo estático por 3s parece travamento.
    Animated.timing(entrada, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const l = Animated.loop(
      Animated.timing(varredura, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    l.start();
    return () => l.stop();
  }, [entrada, varredura]);

  return (
    // Unica tela registrada com headerShown: false, portanto a unica responsavel
    // pelo proprio inset de topo. As demais recebem isso do header nativo.
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Aurora />

      <Animated.View
        style={{
          opacity: entrada,
          transform: [
            { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
          alignItems: 'center',
        }}
      >
        <Image source={require('../../splash.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      {/* Trilho de carregamento: um traço que atravessa, como um pacote
          percorrendo o túnel. Diz "trabalhando" sem spinner genérico. */}
      <View style={styles.trilho}>
        <Animated.View
          style={[
            styles.pulso,
            {
              opacity: varredura.interpolate({
                inputRange: [0, 0.15, 0.85, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: varredura.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-70, 70],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <Text style={styles.rodape}>conexão segura</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  logo: { width: 200, height: 200, marginBottom: spacing.xl },
  trilho: {
    width: 140,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  pulso: { width: 70, height: 2, borderRadius: 1, backgroundColor: colors.primary },
  rodape: {
    ...type.label,
    color: colors.textDim,
    marginTop: spacing.lg,
  },
});
