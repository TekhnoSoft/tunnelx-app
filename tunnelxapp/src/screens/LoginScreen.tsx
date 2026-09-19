import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, QrCode } from 'phosphor-react-native';
import { login, SessionActiveError } from '../api/client';
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
   * Continua valendo para quem foi cadastrado no painel, ou teve a senha
   * regerada pelo suporte — o login detecta e desvia sozinho.
   */
  onNeedsNewPassword: (client: SessionClient, senhaProvisoria: string) => void;
  onCriarConta: () => void;
  /**
   * Acesso provisionado: alguém compartilhou um túnel e vai mostrar o QR.
   *
   * Fica na tela de entrada porque é onde o convidado chega — ele não tem conta
   * nem plano, e qualquer caminho que passe por login ou pagamento antes de ler
   * o convite o deixaria sem entender o que está fazendo ali.
   */
  onAcessoProvisionado: () => void;
};

export default function LoginScreen({
  onSigned,
  onNeedsNewPassword,
  onCriarConta,
  onAcessoProvisionado,
}: Props) {
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

  /**
   * A conta já está aberta em outro aparelho.
   *
   * Pergunta antes de derrubar. O usuário pode estar entrando no telefone de
   * alguém, ou pode ter esquecido a conta aberta no aparelho antigo — só ele
   * sabe, e o nome do aparelho é o que permite reconhecer a situação.
   */
  const perguntarSeForca = (e: SessionActiveError) => {
    const desde = e.since
      ? new Date(e.since).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : null;

    Alert.alert(
      'Conta em uso',
      `Sua conta está aberta em ${e.device}${desde ? ` desde ${desde}` : ''}.\n\n` +
        'Sua assinatura vale para um aparelho por vez. Se continuar, o outro será ' +
        'desconectado agora.',
      [
        // O `finally` do `entrar` já desligou o carregando antes do diálogo abrir.
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Entrar aqui',
          style: 'destructive',
          onPress: () => entrar(true),
        },
      ],
      { cancelable: false }
    );
  };

  const entrar = async (forcar = false) => {
    if (!forcar && !podeEntrar) return;
    setErro(null);
    setCarregando(true);
    try {
      const { client, mustChangePassword } = await login(digitos, senha, forcar);

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
      if (e instanceof SessionActiveError) {
        // Não é erro de credencial: a senha estava certa. Vira uma escolha.
        perguntarSeForca(e);
        return;
      }
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
              onSubmitEditing={() => entrar()}
              hint={erro ?? undefined}
              hintTone="error"
            />

            <Button
              label="Entrar"
              onPress={() => entrar()}
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

          <Button label="Criar minha conta" variant="ghost" onPress={onCriarConta} />

          <Button
            label="Acesso provisionado"
            variant="ghost"
            onPress={onAcessoProvisionado}
            icon={<QrCode size={18} color={colors.greenInk} weight="duotone" />}
            style={styles.botaoConvite}
          />

          <Text style={styles.ajuda}>
            Ainda não é cliente? Crie sua conta em um minuto e escolha seu plano. Se você recebeu
            uma senha da TunnelX, é só entrar acima com ela.
          </Text>
          <Text style={styles.ajuda}>
            <Text style={styles.destaque}>Acesso provisionado</Text> é para quem vai usar a conexão
            de um familiar: leia o QR que ele mostrar no aplicativo dele.
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
  botaoConvite: { marginTop: spacing.md },
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
