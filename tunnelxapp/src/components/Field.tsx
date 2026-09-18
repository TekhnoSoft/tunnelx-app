import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeSlash } from 'phosphor-react-native';
import { colors, radius, spacing, type } from '../theme';

type Props = TextInputProps & {
  label?: string;
  /** Mensagem sob o campo: erro em vermelho, dica em âmbar. */
  hint?: string;
  hintTone?: 'warn' | 'error';
  /** Adiciona o olho de mostrar/ocultar e liga o secureTextEntry. */
  secret?: boolean;
  /** Monoespaçado para chave, IP e endpoint — dado conferido caractere a caractere. */
  mono?: boolean;
  containerStyle?: ViewStyle;
};

export default function Field({
  label,
  hint,
  hintTone = 'warn',
  secret,
  mono,
  containerStyle,
  style,
  editable = true,
  ...rest
}: Props) {
  const [focado, setFocado] = useState(false);
  const [revelado, setRevelado] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View
        style={[
          styles.box,
          focado && styles.boxFocado,
          !editable && styles.boxInativo,
          hint && hintTone === 'error' ? styles.boxErro : null,
        ]}
      >
        <TextInput
          {...rest}
          editable={editable}
          onFocus={e => {
            setFocado(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocado(false);
            rest.onBlur?.(e);
          }}
          secureTextEntry={secret && !revelado}
          placeholderTextColor={colors.textDim}
          style={[styles.input, mono && styles.mono, style]}
        />

        {secret ? (
          <TouchableOpacity
            onPress={() => setRevelado(v => !v)}
            style={styles.olho}
            hitSlop={8}
            accessibilityLabel={revelado ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {revelado ? (
              <EyeSlash size={20} color={colors.textMuted} />
            ) : (
              <Eye size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {hint ? (
        <Text style={[styles.hint, hintTone === 'error' && styles.hintErro]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...type.label, color: colors.textDim, marginBottom: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  // O anel azul no foco e o que diz onde se esta digitando quando o teclado
  // cobre metade da tela.
  boxFocado: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  boxErro: { borderColor: colors.danger },
  boxInativo: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  mono: { ...type.mono, fontSize: 14 },
  olho: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  hint: { ...type.tiny, color: colors.warning, marginTop: spacing.sm, fontWeight: '500' },
  hintErro: { color: colors.danger },
});
