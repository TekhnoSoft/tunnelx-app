import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Power, ShieldCheck, ShieldSlash } from 'phosphor-react-native';
import { brand, colors, shadow, spacing, type } from '../theme';

type Props = {
  connected: boolean;
  busy?: boolean;
  size: number;
  /** Nome do túnel ativo, ou o que será ligado ao tocar. */
  subtitle?: string;
  onPress: () => void;
};

/**
 * Orbe de conexão — o estado do app em um olhar.
 *
 * É a resposta à pergunta que traz o usuário ao app ("estou protegido?"), então
 * ocupa o topo da Home inteiro e responde por cor, movimento e texto ao mesmo
 * tempo: cor sozinha exclui quem não distingue verde de cinza, e movimento
 * sozinho não diz de qual túnel se trata.
 *
 * Também é o botão. Ligar/desligar era uma chave de 40px perdida na linha do
 * túnel; aqui é um alvo grande no centro do polegar.
 */
export default function ConnectionOrb({ connected, busy, size, subtitle, onPress }: Props) {
  const pulso = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;

  // Pulso só quando conectado: um orbe que respira desligado mentiria sobre o
  // estado, que é justamente o que esta tela existe para não fazer.
  useEffect(() => {
    if (!connected) {
      pulso.stopAnimation();
      pulso.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(pulso, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [connected, pulso]);

  // O anel gira sempre — devagar quando parado, rápido durante a transição.
  // É o que diferencia "desconectado" de "conectando" sem precisar de texto.
  useEffect(() => {
    giro.setValue(0);
    const anim = Animated.loop(
      Animated.timing(giro, {
        toValue: 1,
        duration: busy ? 900 : connected ? 9000 : 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [busy, connected, giro]);

  const rotacao = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const anel = (atraso: number) => ({
    opacity: pulso.interpolate({
      inputRange: [0, atraso, atraso + 0.45, 1],
      outputRange: [0, 0.45, 0, 0],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        scale: pulso.interpolate({
          inputRange: [0, atraso, atraso + 0.45, 1],
          outputRange: [0.85, 0.95, 1.3, 1.3],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  });

  // Verde da marca no traço, verde escuro no texto: o #5CF463 puro é ilegível
  // como palavra sobre branco.
  const traco = connected ? brand.green : colors.borderStrong;
  const tinta = connected ? colors.greenInk : colors.textDim;
  const raio = size / 2;
  const espessura = Math.max(3, size * 0.016);
  const rDash = raio - espessura * 2;
  const perimetro = 2 * Math.PI * rDash;

  return (
    <View style={[styles.wrap, { height: size + 72 }]}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={connected ? 'Desconectar o túnel' : 'Conectar o túnel'}
        accessibilityState={{ busy: !!busy }}
        style={({ pressed }) => [
          { width: size, height: size },
          styles.orb,
          pressed && !busy && { transform: [{ scale: 0.97 }] },
        ]}
      >
        {/* Anéis de pulso: ondas saindo do centro quando o túnel está de pé. */}
        {connected ? (
          <>
            <Animated.View
              style={[styles.anel, { borderColor: brand.green, borderRadius: raio }, anel(0)]}
            />
            <Animated.View
              style={[styles.anel, { borderColor: brand.green, borderRadius: raio }, anel(0.3)]}
            />
          </>
        ) : null}

        {/* Disco branco: o card em forma de círculo, com a mesma sombra dos
            demais para pertencer ao mesmo sistema. */}
        <View
          style={[
            styles.disco,
            {
              width: size - espessura * 6,
              height: size - espessura * 6,
              borderRadius: (size - espessura * 6) / 2,
            },
          ]}
        />

        {/* Anel tracejado em rotação. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotacao }] }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="orbe-anel" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={connected ? '#17A52A' : colors.borderStrong} />
                <Stop offset="1" stopColor={traco} />
              </LinearGradient>
            </Defs>
            <Circle
              cx={raio}
              cy={raio}
              r={rDash}
              stroke="url(#orbe-anel)"
              strokeWidth={espessura}
              strokeDasharray={`${perimetro * 0.09} ${perimetro * 0.045}`}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <View style={styles.centro}>
          {busy ? (
            <Power size={size * 0.2} color={tinta} weight="duotone" />
          ) : connected ? (
            <ShieldCheck size={size * 0.22} color={colors.greenInk} weight="duotone" />
          ) : (
            <ShieldSlash size={size * 0.22} color={colors.textDim} weight="duotone" />
          )}
          <Text style={[styles.estado, { color: connected ? colors.greenInk : colors.textMuted }]}>
            {busy ? 'Aguarde' : connected ? 'Protegido' : 'Desprotegido'}
          </Text>
          <Text style={styles.acao}>
            {busy ? 'trabalhando…' : connected ? 'toque para desligar' : 'toque para ligar'}
          </Text>
        </View>
      </Pressable>

      <Text style={styles.legenda} numberOfLines={1}>
        {subtitle ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  orb: { alignItems: 'center', justifyContent: 'center' },
  anel: { position: 'absolute', width: '100%', height: '100%', borderWidth: 2 },
  disco: {
    position: 'absolute',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  centro: { alignItems: 'center', gap: 2 },
  estado: { ...type.title, marginTop: spacing.sm },
  acao: { ...type.tiny, color: colors.textDim, fontWeight: '500', textTransform: 'lowercase' },
  legenda: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.lg,
    maxWidth: '90%',
    textAlign: 'center',
  },
});
