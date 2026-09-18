import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  total: number;
  /** Índice do passo atual, base zero. */
  atual: number;
  style?: ViewStyle;
};

/**
 * Indicador de etapas do primeiro acesso.
 *
 * O passo atual é um traço, não um ponto maior: a diferença de forma sobrevive
 * ao daltonismo e ao brilho do sol, que é onde só-cor falha.
 */
export default function StepDots({ total, atual, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.ponto, i === atual && styles.ativo, i < atual && styles.feito]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  ativo: { width: 22, backgroundColor: colors.primary },
  feito: { backgroundColor: colors.green },
});
