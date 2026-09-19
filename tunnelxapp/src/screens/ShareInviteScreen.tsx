import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareNetwork, Clock, ArrowLeft, WarningCircle } from 'phosphor-react-native';
import QrScanner from '../components/QrScanner';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import { parseShareQr, previewShare, type SharePreview } from '../api/client';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useWindowDimensions } from 'react-native';

type Props = {
  /** Já tem conta: leva para o login guardando o convite. */
  onEntrar?: (token: string) => void;
  /** Não tem conta: leva para o cadastro guardando o convite. */
  onCadastrar?: (token: string) => void;
  /**
   * Quem chegou aqui JÁ logado — pelo ícone de leitura no topo da Home.
   *
   * Aqui não há login nem cadastro pelo caminho: o aceite acontece na hora.
   * Quando esta função existe, ela substitui as outras duas.
   */
  onAceitar?: (token: string) => Promise<void>;
  onVoltar: () => void;
};

/**
 * Acesso provisionado — entrar no túnel de outra pessoa.
 *
 * Quem chega aqui normalmente não tem conta: é o familiar do assinante, com o
 * celular na mão, apontando para o QR na tela do titular.
 *
 * A tela mostra o convite ANTES de pedir qualquer cadastro. Mandar a pessoa
 * criar conta primeiro — sem saber de quem é o convite nem por quanto tempo
 * vale — seria pedir dados a troco de nada, e ainda por cima antes de descobrir
 * que o convite expirou ou que o túnel está cheio.
 *
 * O QR carrega um token, não a configuração do WireGuard: é o servidor que
 * confere a vaga, aplica o prazo e entrega o acesso.
 */
export default function ShareInviteScreen({ onEntrar, onCadastrar, onAceitar, onVoltar }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);

  const [convite, setConvite] = useState<{ token: string; dados: SharePreview } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const onCode = useCallback(async (texto: string) => {
    const token = parseShareQr(texto);
    if (!token) {
      // QR de outra coisa (a configuração de um túnel, um link qualquer). Não é
      // erro do usuário — a câmera lê o que estiver na frente. Rearma.
      return false;
    }

    setVerificando(true);
    setErro(null);
    try {
      const dados = await previewShare(token);
      setConvite({ token, dados });
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível validar este convite.');
    } finally {
      setVerificando(false);
    }
    // Assume o fluxo nos dois casos: com o convite lido ou com o erro na tela,
    // a câmera não deve continuar disparando por trás.
    return true;
  }, []);

  const tentarDeNovo = () => {
    setErro(null);
    setConvite(null);
  };

  /* ------------------------------------------------------------- verificando */

  if (verificando) {
    return (
      <Screen>
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.carregando}>Validando o convite…</Text>
        </View>
      </Screen>
    );
  }

  /* -------------------------------------------------------------------- erro */

  if (erro) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingHorizontal: m.gutter, paddingTop: insets.top + spacing.xxl },
          ]}
        >
          <View style={[styles.icone, styles.iconeErro]}>
            <WarningCircle size={30} color={colors.danger} weight="duotone" />
          </View>
          <Text style={styles.titulo}>Convite não aceito</Text>
          <Text style={styles.subtitulo}>{erro}</Text>

          <Button label="Ler outro QR" onPress={tentarDeNovo} style={styles.botao} />
          <Pressable onPress={onVoltar} hitSlop={8} style={styles.voltarTexto}>
            <Text style={styles.voltarLabel}>{onAceitar ? 'Voltar' : 'Voltar para a entrada'}</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  /* ----------------------------------------------------------------- convite */

  if (convite) {
    const { dados, token } = convite;
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            {
              paddingHorizontal: m.gutter,
              paddingTop: insets.top + spacing.xxl,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.icone}>
            <ShareNetwork size={30} color={colors.greenInk} weight="duotone" />
          </View>

          <Text style={styles.titulo}>Você foi convidado</Text>
          <Text style={styles.subtitulo}>
            <Text style={styles.nome}>{dados.owner_name}</Text> está compartilhando uma conexão
            com você.
          </Text>

          <Card style={styles.cartao}>
            <Linha rotulo="Conexão" valor={dados.connection_name} />
            <Linha rotulo="Convidado por" valor={dados.owner_name} />
            <Linha rotulo="Período de acesso" valor={dados.duration_label} destaque />
          </Card>

          <View style={styles.aviso}>
            <Clock size={15} color={colors.textMuted} weight="bold" />
            <Text style={styles.avisoTexto}>
              O prazo começa a contar quando você aceitar. Você não paga nada — a assinatura é de{' '}
              {dados.owner_name}, e o acesso pode ser encerrado por ele a qualquer momento.
            </Text>
          </View>

          {onAceitar ? (
            <Button
              label="Entrar nesta conexão"
              loading={aceitando}
              onPress={async () => {
                setAceitando(true);
                try {
                  await onAceitar(token);
                } catch (e: any) {
                  // O convite pode ter expirado ou o túnel enchido entre a
                  // leitura e o toque. Mostra o motivo em vez de voltar calado.
                  setErro(e?.message || 'Não foi possível entrar nesta conexão.');
                } finally {
                  setAceitando(false);
                }
              }}
              style={styles.botao}
            />
          ) : (
            <>
              <Button
                label="Criar minha conta e entrar"
                onPress={() => onCadastrar?.(token)}
                style={styles.botao}
              />
              <Button
                label="Já tenho conta"
                variant="ghost"
                onPress={() => onEntrar?.(token)}
                style={styles.botao}
              />
            </>
          )}

          <Pressable onPress={onVoltar} hitSlop={8} style={styles.voltarTexto}>
            <Text style={styles.voltarLabel}>Cancelar</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  /* ----------------------------------------------------------------- câmera */

  return (
    <View style={styles.camera}>
      <QrScanner
        hint="Aponte para o QR do convite"
        motivoPermissao="A câmera é usada apenas para ler o QR do convite de acesso."
        onCode={onCode}
      />
      <Pressable
        onPress={onVoltar}
        hitSlop={12}
        style={[styles.voltarFlutuante, { top: insets.top + spacing.md, left: m.gutter }]}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <ArrowLeft size={20} color="#fff" weight="bold" />
      </Pressable>
    </View>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={[styles.linhaValor, destaque && styles.linhaValorDestaque]} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  voltarFlutuante: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.72)',
  },

  conteudo: { flexGrow: 1, alignItems: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  carregando: { ...type.small, color: colors.textMuted },

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
  iconeErro: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },

  titulo: { ...type.title, color: colors.text, marginTop: spacing.lg, textAlign: 'center' },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  nome: { color: colors.greenInk, fontWeight: '700' },

  cartao: { alignSelf: 'stretch', marginTop: spacing.xl },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  linhaRotulo: { ...type.small, color: colors.textMuted },
  linhaValor: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
  linhaValorDestaque: { color: colors.greenInk, fontWeight: '800' },

  aviso: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  avisoTexto: { ...type.tiny, color: colors.textMuted, lineHeight: 17, flex: 1 },

  botao: { alignSelf: 'stretch', marginTop: spacing.md },
  voltarTexto: { marginTop: spacing.lg, padding: spacing.sm },
  voltarLabel: { ...type.small, color: colors.textDim, fontWeight: '600' },
});
