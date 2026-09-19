import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'phosphor-react-native';
import { login } from '../api/client';
import { syncConnections } from '../services/sync';
import type { SessionClient } from '../storage/session';
import { maskCpf } from '../utils/cpf';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useKeyboardOverlap } from '../theme/useLayout';

type Props = {
  onSigned: (client: SessionClient) => void;
  /**
   * Entrou com a senha que o operador entregou e ainda precisa criar a dele.
   * Acontece também por este caminho, e não só pelo "Primeiro acesso": quem teve
   * a senha regerada pelo suporte cai aqui sem saber que virou provisória.
   */
  onNeedsNewPassword: (client: SessionClient, senhaProvisoria: string) => void;
  onFirstAccess: () => void;
};

export default function LoginScreen({ onSigned, onNeedsNewPassword, onFirstAccess }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);
  const tecladoCobre = useKeyboardOverlap();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const digitos = cpf.replace(/\D/g, '');
  const podeEntrar = digitos.length === 11 && senha.length > 0 && !carregando;

  const entrar = async () => {
    if (!podeEntrar) return;
    setErro(null);
    setCarregando(true);
    try {
      const { client, mustChangePassword } = await login(digitos, senha);

      // Senha ainda é a do balcão: o token que acabou de chegar só abre a troca,
      // então nem adianta sincronizar — /app/connections responderia 403.
      if (mustChangePassword) {
        onNeedsNewPassword(client, senha);
        return;
      }

      // A importação dos túneis não pode derrubar o login: se a rede cair no
      // meio, o usuário entra assim mesmo e sincroniza depois pela Home.
      try {
        await syncConnections();
      } catch (e) {
        console.warn('[Login] falha ao sincronizar conexões', e);
      }

      onSigned(client);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível entrar.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Screen>
      {/* Sem `behavior`: quem empurra o conteudo e o useKeyboardOverlap, que
          mede a sobreposicao real. Com 'padding' no iOS os dois somariam e o
          formulario subiria o dobro do necessario. */}
      <KeyboardAvoidingView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: m.gutter,
              paddingTop: insets.top + spacing.xxl,
              paddingBottom: insets.bottom + spacing.xl + tecladoCobre,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logoAro}>
              <Image source={require('../../logo.png')} style={styles.logo} />
            </View>
            <Text style={styles.title}>
              Tunnel<Text style={styles.x}>X</Text>
            </Text>
            <Text style={styles.subtitle}>Sua conexão protegida, onde você estiver</Text>
          </View>

          <Card label="Entrar">
            <Field
              label="CPF"
              value={cpf}
              onChangeText={t => setCpf(maskCpf(t))}
              placeholder="000.000.000-00"
              keyboardType="number-pad"
              returnKeyType="next"
              maxLength={14}
              autoComplete="off"
              mono
            />

            <Field
              label="Senha"
              value={senha}
              onChangeText={setSenha}
              placeholder="Sua senha"
              secret
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={entrar}
              hint={erro ?? undefined}
              hintTone="error"
            />

            <Button
              label="Entrar"
              onPress={entrar}
              disabled={!podeEntrar}
              loading={carregando}
              icon={<ArrowRight size={18} color="#fff" weight="bold" />}
              style={styles.botao}
            />
          </Card>

          <View style={styles.divisor}>
            <View style={styles.linha} />
            <Text style={styles.divisorTexto}>ou</Text>
            <View style={styles.linha} />
          </View>

          <Button label="Primeiro acesso" variant="ghost" onPress={onFirstAccess} />

          <Text style={styles.ajuda}>
            É a sua primeira vez no app? Use o <Text style={styles.destaque}>Primeiro acesso</Text>{' '}
            com o CPF e a senha provisória que você recebeu no cadastro.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  logoAro: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  logo: { width: 52, height: 52, resizeMode: 'contain' },
  title: { ...type.display, color: colors.text, marginTop: spacing.lg },
  x: { color: colors.greenInk },
  subtitle: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  botao: { marginTop: spacing.sm },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xl },
  linha: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  divisorTexto: { ...type.tiny, color: colors.textDim, fontWeight: '500' },
  ajuda: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
    fontWeight: '500',
  },
  destaque: { color: colors.textMuted, fontWeight: '700' },
});
