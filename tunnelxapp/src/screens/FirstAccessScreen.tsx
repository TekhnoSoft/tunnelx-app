import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Key, ArrowRight } from 'phosphor-react-native';
import { login } from '../api/client';
import type { SessionClient } from '../storage/session';
import { maskCpf } from '../utils/cpf';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import StepDots from '../components/StepDots';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useKeyboardOverlap } from '../theme/useLayout';

type Props = {
  /**
   * Entrou com a senha provisória: quem chama leva à tela de nova senha e
   * repassa `senhaProvisoria`, para não pedir de novo o que acabou de ser
   * digitado. A senha fica só em memória.
   */
  onNeedsNewPassword: (client: SessionClient, senhaProvisoria: string) => void;
  /**
   * A senha já não era provisória — o cliente tinha trocado antes e veio parar
   * aqui por engano. Não faz sentido mandá-lo de volta ao login: ele acabou de
   * se autenticar, então entra direto.
   */
  onSigned: (client: SessionClient) => void;
  onCancel: () => void;
};

export default function FirstAccessScreen({ onNeedsNewPassword, onSigned, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);
  const tecladoCobre = useKeyboardOverlap();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const digitos = cpf.replace(/\D/g, '');
  const podeContinuar = digitos.length === 11 && senha.length > 0 && !carregando;

  const continuar = async () => {
    if (!podeContinuar) return;
    setErro(null);
    setCarregando(true);
    try {
      const { client, mustChangePassword } = await login(digitos, senha);
      if (mustChangePassword) {
        onNeedsNewPassword(client, senha);
      } else {
        onSigned(client);
      }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível confirmar seus dados.');
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
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.xl + tecladoCobre,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.voltar} onPress={onCancel} hitSlop={8}>
            <ArrowLeft size={18} color={colors.textMuted} />
            <Text style={styles.voltarTexto}>Voltar</Text>
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.icone}>
              <Key size={30} color={colors.primary} weight="duotone" />
            </View>
            <Text style={styles.title}>Primeiro acesso</Text>
            <Text style={styles.subtitle}>
              Confirme seu CPF e digite a senha provisória que você recebeu no cadastro.
            </Text>
            {/* O passo 2 é a criação da senha. Mostrar que existe uma etapa
                seguinte evita a sensação de "já era pra ter entrado". */}
            <StepDots total={2} atual={0} style={styles.passos} />
          </View>

          <Card label="Seus dados">
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
              label="Senha provisória"
              value={senha}
              onChangeText={setSenha}
              placeholder="Ex.: 69512210"
              secret
              mono
              // A senha gerada é só de dígitos: o teclado numérico abre direto,
              // sem o usuário caçar os números no alfabético.
              keyboardType="number-pad"
              maxLength={8}
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={continuar}
              hint={erro ?? undefined}
              hintTone="error"
            />

            <Button
              label="Continuar"
              onPress={continuar}
              disabled={!podeContinuar}
              loading={carregando}
              icon={<ArrowRight size={18} color="#fff" weight="bold" />}
              style={styles.botao}
            />
          </Card>

          <Text style={styles.ajuda}>
            A senha provisória é entregue pela TunnelX no momento do cadastro. Se você não recebeu
            ou não lembra, fale com o suporte — uma nova pode ser gerada.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  voltarTexto: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  icone: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: { ...type.title, color: colors.text, marginTop: spacing.lg },
  subtitle: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  passos: { marginTop: spacing.lg },
  botao: { marginTop: spacing.sm },
  ajuda: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
    fontWeight: '500',
  },
});
