import { StatusBar } from 'expo-status-bar';
import { Home } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, RF, SERIF, WIDE_BREAKPOINT } from '../../constants/Refugio';
import { InfoModal } from '../profile/InfoModal';
import { LEGAL_CONTACT, LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from '../profile/profileContent';

export type AuthShellProps = {
  heroImage: string;
  /** Texto pequeno em dourado acima do título do painel de imagem. */
  eyebrow: string;
  heroTitle: string;
  /** Trecho final do título em itálico dourado (opcional). */
  heroTitleAccent?: string;
  heroSubtitle: string;
  /** Conteúdo extra no rodapé do painel de imagem (só aparece em tela larga ou se `showHeroFooterOnMobile`). */
  heroFooter?: React.ReactNode;
  /** Etiqueta "vidro" no topo do painel de imagem. */
  heroBadge?: string;
  /** Linha acima da marca, no painel do formulário (ex.: "← Voltar ao login"). */
  topBar?: React.ReactNode;
  /** Painel de imagem mais baixo no celular (telas com mais campos). */
  compactHero?: boolean;
  children: React.ReactNode;
  testID?: string;
};

/**
 * Moldura comum das telas de acesso no estilo "Refúgio": painel de foto com
 * texto à esquerda e formulário em papel creme à direita. No celular (tela
 * estreita) os dois painéis ficam empilhados e o formulário sobe por cima da
 * foto com cantos arredondados.
 */
export function AuthShell({
  heroImage,
  eyebrow,
  heroTitle,
  heroTitleAccent,
  heroSubtitle,
  heroFooter,
  heroBadge,
  topBar,
  compactHero,
  children,
  testID,
}: AuthShellProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Só decide o layout largo depois de montar: no web com renderização
  // estática a largura no servidor é 0, e decidir antes causa erro de hidratação.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= WIDE_BREAKPOINT;
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <View style={styles.root} testID={testID}>
      <StatusBar style={wide ? 'dark' : 'light'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* PAINEL DE IMAGEM */}
          <ImageBackground
            source={{ uri: heroImage }}
            style={wide ? styles.heroWide : [styles.heroMobile, compactHero && styles.heroMobileCompact]}
            imageStyle={styles.heroImage}
            accessibilityIgnoresInvertColors
          >
            <View style={styles.scrimTop} pointerEvents="none" />
            <View style={styles.scrimBottom} pointerEvents="none" />

            <View
              style={[
                styles.heroContent,
                { paddingTop: (wide ? 48 : 20) + (wide ? 0 : insets.top) },
                !wide && styles.heroContentMobile,
              ]}
            >
              {heroBadge ? (
                <View style={styles.glassPill}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.glassPillText}>{heroBadge}</Text>
                </View>
              ) : (
                <View />
              )}

              <View style={wide ? styles.heroTextWide : undefined}>
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={[styles.heroTitle, !wide && styles.heroTitleMobile]}>
                  {heroTitle}
                  {heroTitleAccent ? <Text style={styles.heroTitleAccent}> {heroTitleAccent}</Text> : null}
                </Text>
                <Text style={[styles.heroSubtitle, !wide && styles.heroSubtitleMobile]} numberOfLines={wide ? undefined : 3}>
                  {heroSubtitle}
                </Text>
                {wide && heroFooter ? <View style={styles.heroFooter}>{heroFooter}</View> : null}
              </View>
            </View>
          </ImageBackground>

          {/* PAINEL DO FORMULÁRIO */}
          <View
            style={[
              styles.panel,
              wide ? styles.panelWide : styles.panelMobile,
              { paddingBottom: 24 + insets.bottom },
            ]}
          >
            <View style={styles.column}>
            <View style={styles.panelHeader}>
              <View style={styles.brandRow}>
                <View style={styles.brandIcon}>
                  <Home size={20} color={RF.gold} strokeWidth={1.8} />
                </View>
                <View>
                  <Text style={styles.brandName}>{BRAND.name.toUpperCase()}</Text>
                  <Text style={styles.brandTagline}>{BRAND.tagline.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {topBar ? <View style={styles.topBar}>{topBar}</View> : null}
            </View>

            <View style={styles.formArea}>{children}</View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>© {new Date().getFullYear()} {BRAND.name}</Text>
              <View style={styles.footerLinks}>
                <Text style={styles.footerLink} onPress={() => setTermsOpen(true)} accessibilityRole="link">
                  Termos de Uso
                </Text>
                <Text style={styles.footerDot}>•</Text>
                <Text style={styles.footerLink} onPress={() => setPrivacyOpen(true)} accessibilityRole="link">
                  Privacidade
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoModal
        visible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="Política de Privacidade"
        subtitle="Como tratamos seus dados"
        sections={PRIVACY_SECTIONS}
        footerText={`Última revisão: ${LEGAL_UPDATED} · Elaborada com base na LGPD (Lei nº 13.709/2018)`}
      />
      <InfoModal
        visible={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="Termos de Serviço"
        subtitle="Regras do ReservaGO"
        sections={TERMS_SECTIONS}
        footerText={`Última revisão: ${LEGAL_UPDATED}. Dúvidas? Fale com ${LEGAL_CONTACT}.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RF.paper },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, backgroundColor: RF.paper },
  scrollWide: { flexDirection: 'row', minHeight: '100%' as any },

  heroMobile: { height: 320, backgroundColor: RF.pine },
  heroMobileCompact: { height: 250 },
  heroWide: { flex: 54, backgroundColor: RF.pine, minHeight: 640 },
  heroImage: { resizeMode: 'cover' },
  scrimTop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22,40,31,0.45)' },
  scrimBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%',
    backgroundColor: 'rgba(22,40,31,0.55)',
  },
  heroContent: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 28, paddingBottom: 28 },
  heroContentMobile: { paddingBottom: 44 },
  heroTextWide: { maxWidth: 560 },

  glassPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(22,40,31,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: RF.gold },
  glassPillText: { color: 'rgba(233,228,220,0.92)', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },

  eyebrow: { color: RF.gold, fontSize: 11, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10 },
  heroTitle: { fontFamily: SERIF, color: RF.white, fontSize: 40, lineHeight: 48 },
  heroTitleMobile: { fontSize: 27, lineHeight: 34 },
  heroTitleAccent: { fontFamily: SERIF, color: RF.gold, fontStyle: 'italic' },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 460 },
  heroSubtitleMobile: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  heroFooter: { marginTop: 28, paddingTop: 22, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },

  panel: { backgroundColor: RF.paper, paddingHorizontal: 26, paddingTop: 26 },
  panelMobile: { marginTop: -26, borderTopLeftRadius: 28, borderTopRightRadius: 28, flexGrow: 1 },
  panelWide: { flex: 46, paddingHorizontal: 56, paddingTop: 48, justifyContent: 'space-between' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: RF.darkmoss,
    alignItems: 'center', justifyContent: 'center',
  },
  brandName: { fontFamily: SERIF, fontSize: 18, letterSpacing: 2, fontWeight: '700', color: RF.pine },
  brandTagline: { fontSize: 9, letterSpacing: 2.2, fontWeight: '700', color: RF.sage, marginTop: 1 },

  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  topBar: { marginTop: 18 },
  formArea: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingVertical: 26, flexGrow: 1, justifyContent: 'center' },

  footer: {
    borderTopWidth: 1, borderTopColor: RF.divider, paddingTop: 16, marginTop: 8,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  footerText: { fontSize: 11, color: RF.warmgray },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerLink: { fontSize: 11, color: RF.sage, fontWeight: '600' },
  footerDot: { fontSize: 11, color: RF.border },
});
