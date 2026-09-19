import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, Check } from 'phosphor-react-native';
import { changePassword, ApiError } from '../api/client';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import StepDots from '../components/StepDots';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useKeyboardOverlap } from '../theme/useLayout';

/** O servidor recusa abaixo disso; validar aqui evita a ida à rede para nada. */
const MINIMO = 6;

type Props = {
  /**
   * Senha provisória já digitada na etapa anterior do primeiro acesso.
   *
   * Vem em memória, nunca do disco: é a credencial que circulou por WhatsApp e
   * não tem por que sobreviver ao fim desta tela. Quando o app é reaberto no
   * meio do primeiro acesso ela se perde — por isso o campo abaixo reaparece em
   * vez de o usuário ficar preso.
   */
  senhaAtual?: string;
  onDone: () => void;
  /**
   * O token provisório venceu (dura 30 min) e a sessão já foi descartada pelo
   * cliente HTTP. Sem este caminho a tela continuaria aceitando toques e
   * falhando: o jeito de sair é refazer o login.
   */
  onSessionLost: () => void;
};

/** Força aproximada: comprimento + variedade. É dica, nunca trava o envio. */
function forca(senha: string): { nivel: 0 | 1 | 2 | 3; texto: string; cor: string } {
  if (senha.length < MINIMO) return { nivel: 0, texto: 'curta demais', cor: colors.textDim };
  let variedade = 0;
  if (/[a-z]/.test(senha)) variedade++;
  if (/[A-Z]/.test(senha)) variedade++;
  if (/[0-9]/.test(senha)) variedade++;
  if (/[^A-Za-z0-9]/.test(senha)) variedade++;

  if (senha.length >= 12 && variedade >= 3) return { nivel: 3, texto: 'forte', cor: colors.greenInk };
  if (senha.length >= 8 && variedade >= 2) return { nivel: 2, texto: 'boa', cor: colors.primary };
  return { nivel: 1, texto: 'fraca', cor: colors.warning };
}

export default function NewPasswordScreen({ senhaAtual, onDone, onSessionLost }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);
  const tecladoCobre = useKeyboardOverlap();
  const precisaPedirAtual = !senhaAtual;

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const senhaEmUso = senhaAtual ?? atual;
  const curta = nova.length > 0 && nova.length < MINIMO;
  const divergem = confirma.length > 0 && nova !== confirma;
  const repetida = nova.length > 0 && nova === senhaEmUso;
  const f = forca(nova);

  const podeSalvar =
    senhaEmUso.length > 0 &&
    nova.length >= MINIMO &&
    nova === confirma &&
    !repetida &&
    !carregando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setErro(null);
    setCarregando(true);
    try {
      await changePassword(senhaEmUso, nova);
      onDone();
    } catch (e: any) {
      // Senha atual errada volta como 400 (é dado, não autenticação). Um 401
      // aqui significa sessão perdida — e o cliente HTTP já apagou o token.
      if (e instanceof ApiError && e.status === 401) {
        onSessionLost();
        return;
      }
      setErro(e?.message || 'Não foi possível salvar a nova senha.');
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
              paddingTop: insets.top + spacing.xl,
              paddingBottom: insets.bottom + spacing.xl + tecladoCobre,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.icone}>
              <ShieldCheck size={30} color={colors.greenInk} weight="duotone" />
            </View>
            <Text style={styles.title}>Crie sua senha</Text>
            <Text style={styles.subtitle}>
              A senha que você recebeu é provisória. Escolha uma que só você saiba para concluir o
              primeiro acesso.
            </Text>
            <StepDots total={2} atual={1} style={styles.passos} />
          </View>

          <Card label="Nova senha" accent={colors.green}>
            {precisaPedirAtual ? (
              <Field
                label="Senha provisória"
                value={atual}
                onChangeText={setAtual}
                placeholder="A senha recebida no cadastro"
                secret
                mono
                keyboardType="number-pad"
                maxLength={8}
                autoCorrect={false}
              />
            ) : null}

            <Field
              label="Nova senha"
              value={nova}
              onChangeText={setNova}
              placeholder={`Ao menos ${MINIMO} caracteres`}
              secret
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Medidor de força: três traços que acendem conforme a senha
                melhora. É informação, não barreira — o envio segue liberado
                assim que o mínimo do servidor é atendido. */}
            {nova.length > 0 ? (
              <View style={styles.medidor}>
                <View style={styles.barras}>
                  {[1, 2, 3].map(n => (
                    <View
                      key={n}
                      style={[
                        styles.barra,
                        f.nivel >= n ? { backgroundColor: f.cor } : null,
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.forcaTexto, { color: f.cor }]}>{f.texto}</Text>
              </View>
            ) : null}

            <Field
              label="Repita a nova senha"
              value={confirma}
              onChangeText={setConfirma}
              placeholder="Digite de novo"
              secret
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={salvar}
              containerStyle={styles.campoConfirma}
            />

            {/* Aviso enquanto digita: errar a confirmação é o tropeço mais comum
                aqui, e descobrir isso só no toque do botão irrita. */}
            {curta ? (
              <Text style={styles.dica}>A senha precisa ter ao menos {MINIMO} caracteres.</Text>
            ) : null}
            {repetida ? (
              <Text style={styles.dica}>Escolha uma senha diferente da provisória.</Text>
            ) : null}
            {divergem ? <Text style={styles.dica}>As duas senhas não estão iguais.</Text> : null}
            {!divergem && confirma.length > 0 && nova === confirma && !repetida && !curta ? (
              <View style={styles.confere}>
                <Check size={13} color={colors.greenInk} weight="bold" />
                <Text style={styles.confereTexto}>As senhas conferem</Text>
              </View>
            ) : null}
            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <Button
              label="Salvar e entrar"
              variant="success"
              onPress={salvar}
              disabled={!podeSalvar}
              loading={carregando}
              style={styles.botao}
            />
          </Card>

          <Text style={styles.ajuda}>
            Depois disso a senha provisória deixa de valer. Você passa a entrar com o seu CPF e a
            senha que acabou de criar.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  icone: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.green,
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
  medidor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  barras: { flexDirection: 'row', gap: 4, flex: 1 },
  barra: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  forcaTexto: { ...type.tiny, fontWeight: '700' },
  campoConfirma: { marginBottom: spacing.sm },
  dica: { ...type.tiny, color: colors.warning, marginBottom: spacing.sm, fontWeight: '500' },
  confere: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
  confereTexto: { ...type.tiny, color: colors.greenInk, fontWeight: '600' },
  erro: {
    ...type.small,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
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
