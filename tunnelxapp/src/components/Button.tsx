import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, gradients, radius, shadow, spacing, type } from '../theme';

type Variant = 'primary' | 'success' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

const FILL: Record<Variant, readonly [string, string] | null> = {
  primary: gradients.primary,
  success: gradients.success,
  danger: gradients.danger,
  ghost: null,
};

/**
 * Botão do app.
 *
 * O preenchimento é um gradiente SVG atrás do conteúdo, e não duas Views
 * sobrepostas fingindo degradê: emenda de cor aparece justamente nos botões
 * largos, que é onde este componente mais é usado. O degradê é curto de
 * propósito — do azul da marca a um azul um passo mais claro — para ler como
 * volume, não como enfeite.
 *
 * `ghost` é o secundário: branco com contorno. Dois botões cheios lado a lado
 * disputariam a mesma atenção e nenhum venceria.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: Props) {
  const fill = FILL[variant];
  const inativo = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inativo, busy: !!loading }}
      // O afundar no toque devolve a confirmação física que a cor estática não dá.
      style={({ pressed }) => [
        styles.base,
        variant === 'ghost' ? styles.ghost : shadow.floating,
        pressed && !inativo && styles.pressed,
        inativo && styles.inativo,
        style,
      ]}
    >
      {fill ? (
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id={`g-${variant}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fill[0]} />
              <Stop offset="1" stopColor={fill[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#g-${variant})`} />
        </Svg>
      ) : null}

      <View style={styles.conteudo}>
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? colors.primary : '#fff'} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, variant === 'ghost' && styles.labelGhost]}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ghost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  inativo: { opacity: 0.4 },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { ...type.body, color: '#fff', fontWeight: '700', letterSpacing: 0.2 },
  labelGhost: { color: colors.primary },
});
