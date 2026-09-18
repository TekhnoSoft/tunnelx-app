import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brand, colors } from '../theme';

const AnimatedView = Animated.View;

type Props = {
  /** Verde quando o túnel está de pé; azul no resto do app. */
  variant?: 'idle' | 'live';
};

/**
 * Véu de fundo: o cinza da marca com um sopro de cor no topo.
 *
 * Opacidade baixa de propósito (~8%). No claro, um gradiente forte vira mancha
 * suja atrás do texto — o papel dele aqui é só tirar o branco chapado e dar
 * profundidade ao card que flutua por cima, não aparecer.
 *
 * A respiração é lenta (9 e 13 segundos, em ciclos desencontrados para não
 * parecer um loop). Um fundo que pulsa no ritmo que o olho acompanha vira
 * distração numa tela que fica aberta.
 */
export default function Aurora({ variant = 'idle' }: Props) {
  const { width, height } = useWindowDimensions();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );

    const l1 = loop(a, 9000);
    const l2 = loop(b, 13000);
    l1.start();
    l2.start();
    return () => {
      l1.stop();
      l2.stop();
    };
  }, [a, b]);

  const topo = variant === 'live' ? brand.green : brand.blue;

  const estiloA = {
    opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
  };
  const estiloB = {
    opacity: b.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
    transform: [{ scale: b.interpolate({ inputRange: [0, 1], outputRange: [1.12, 0.96] }) }],
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      <AnimatedView style={[styles.blob, { width, height: height * 0.6 }, estiloA]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="veu-topo" cx="50%" cy="40%" r="60%">
              <Stop offset="0" stopColor={topo} stopOpacity="0.14" />
              <Stop offset="0.6" stopColor={topo} stopOpacity="0.04" />
              <Stop offset="1" stopColor={topo} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#veu-topo)" />
        </Svg>
      </AnimatedView>

      <AnimatedView
        style={[styles.blob, { width, height: height * 0.55, top: height * 0.5 }, estiloB]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="veu-base" cx="50%" cy="50%" r="55%">
              <Stop offset="0" stopColor={brand.blue} stopOpacity="0.07" />
              <Stop offset="0.6" stopColor={brand.blue} stopOpacity="0.02" />
              <Stop offset="1" stopColor={brand.blue} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#veu-base)" />
        </Svg>
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', left: 0, top: -60 },
});
