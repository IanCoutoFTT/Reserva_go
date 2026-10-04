import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LayoutDashboard, CheckCircle, XCircle, TrendingUp, Users, Home, ChevronLeft, AlertOctagon, Star, ShieldAlert } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import {
  AdminStats,
  archiveReport,
  getPendingProperties,
  getReportsWithContext,
  getStats,
  getTopProperties,
  resolveReport,
  ReportWithContext,
} from '../services/adminService';
import { approveProperty, getProperties, setFeatured } from '../services/propertyService';
import type { Property as DbProperty } from '../services/types';
import { formatCurrency } from '../lib/format';

type ApprovalSubTab = 'pendente' | 'ativo' | 'inativo';

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'stats' | 'approvals' | 'reports' | 'highlights'>('stats');
  const [approvalSubTab, setApprovalSubTab] = useState<ApprovalSubTab>('pendente');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [topProperties, setTopProperties] = useState<DbProperty[]>([]);
  const [loadingTop, setLoadingTop] = useState(true);

  const [pendingCabins, setPendingCabins] = useState<DbProperty[]>([]);
  const [loadingCabins, setLoadingCabins] = useState(true);
  const [approvedCabins, setApprovedCabins] = useState<DbProperty[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [rejectedCabins, setRejectedCabins] = useState<DbProperty[]>([]);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const [reports, setReports] = useState<ReportWithContext[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [featuredList, setFeaturedList] = useState<DbProperty[]>([]);
  const [loadingFeaturedList, setLoadingFeaturedList] = useState(false);
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null);

  const loadStats = () => {
    if (!isAdmin) { setLoadingStats(false); return; }
    setLoadingStats(true);
    getStats().then(({ data, error }) => {
      if (error) console.log('[admin] getStats falhou ->', error);
      setStats(data);
      setLoadingStats(false);
    });
  };

  const loadTop = () => {
    if (!isAdmin) { setLoadingTop(false); return; }
    setLoadingTop(true);
    getTopProperties(5).then(({ data, error }) => {
      if (error) console.log('[admin] getTopProperties falhou ->', error);
      setTopProperties(data ?? []);
      setLoadingTop(false);
    });
  };

  const loadPending = () => {
    if (!isAdmin) { setLoadingCabins(false); return; }
    setLoadingCabins(true);
    getPendingProperties().then(({ data, error }) => {
      if (error) console.log('[admin] getPendingProperties falhou ->', error);
      setPendingCabins(data ?? []);
      setLoadingCabins(false);
    });
  };

  // properties_admin_read (schema.sql) já deixa o admin ler cabana de
  // qualquer status - reaproveita o mesmo getProperties() público que a
  // Explorar usa, só passando o status certo.
  const loadApproved = () => {
    if (!isAdmin) return;
    setLoadingApproved(true);
    getProperties({ status: 'ativo' }).then(({ data, error }) => {
      if (error) console.log('[admin] getProperties(ativo) falhou ->', error);
      setApprovedCabins(data ?? []);
      setLoadingApproved(false);
    });
  };

  const loadRejected = () => {
    if (!isAdmin) return;
    setLoadingRejected(true);
    getProperties({ status: 'inativo' }).then(({ data, error }) => {
      if (error) console.log('[admin] getProperties(inativo) falhou ->', error);
      setRejectedCabins(data ?? []);
      setLoadingRejected(false);
    });
  };

  const loadReports = () => {
    if (!isAdmin) { setLoadingReports(false); return; }
    setLoadingReports(true);
    getReportsWithContext().then(({ data, error }) => {
      if (error) console.log('[admin] getReportsWithContext falhou ->', error);
      setReports((data ?? []).filter((r) => r.status === 'pendente' || r.status === 'em_analise'));
      setLoadingReports(false);
    });
  };

  const loadFeaturedList = () => {
    if (!isAdmin) return;
    setLoadingFeaturedList(true);
    getProperties({ status: 'ativo' }).then(({ data, error }) => {
      if (error) console.log('[admin] getProperties(ativo p/ destaques) falhou ->', error);
      setFeaturedList(data ?? []);
      setLoadingFeaturedList(false);
    });
  };

  useEffect(() => {
    loadStats();
    loadTop();
    loadPending();
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Aprovadas/Reprovadas e Destaques só carregam quando o admin de fato abre
  // essa aba/sub-aba - evita 2 queries extras toda vez que o painel abre.
  useEffect(() => {
    if (tab !== 'approvals') return;
    if (approvalSubTab === 'ativo' && !loadingApproved) loadApproved();
    if (approvalSubTab === 'inativo' && !loadingRejected) loadRejected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, approvalSubTab, isAdmin]);

  useEffect(() => {
    if (tab === 'highlights' && !loadingFeaturedList) loadFeaturedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  const handleApprove = async (property: DbProperty, aprovado: boolean) => {
    const { error } = await approveProperty(property.id, aprovado);
    if (error) {
      Alert.alert('Erro', 'Não foi possível atualizar esse anúncio agora. Tente novamente.');
      return;
    }
    Alert.alert('Sucesso', `"${property.title}" foi ${aprovado ? 'aprovada' : 'reprovada'}.`);
    loadPending();
    loadStats();
    loadApproved();
    loadRejected();
  };

  const handleResolveReport = async (report: ReportWithContext) => {
    const { error } = await resolveReport(report.id, user?.id);
    if (error) {
      Alert.alert('Erro', 'Não foi possível resolver essa denúncia agora. Tente novamente.');
      return;
    }
    Alert.alert('Denúncia resolvida', 'A denúncia foi marcada como resolvida.');
    loadReports();
    loadStats();
  };

  const handleArchiveReport = async (report: ReportWithContext) => {
    const { error } = await archiveReport(report.id, user?.id);
    if (error) {
      Alert.alert('Erro', 'Não foi possível arquivar essa denúncia agora. Tente novamente.');
      return;
    }
    loadReports();
    loadStats();
  };

  const handleToggleFeatured = async (property: DbProperty) => {
    setTogglingFeaturedId(property.id);
    const { error } = await setFeatured(property.id, !property.featured);
    setTogglingFeaturedId(null);
    if (error) {
      Alert.alert('Erro', 'Não foi possível atualizar o destaque agora. Tente novamente.');
      return;
    }
    setFeaturedList((prev) => prev.map((p) => (p.id === property.id ? { ...p, featured: !p.featured } : p)));
  };

  // Protege o acesso: só role === 'admin' vê o painel. A garantia de
  // verdade é a RLS no banco (properties_admin_update, reports_admin_*),
  // isto aqui é só pra não nem mostrar a UI pra quem não é admin.
  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <ShieldAlert size={48} color="#EF4444" />
        <Text style={styles.deniedTitle}>Acesso restrito</Text>
        <Text style={styles.deniedText}>Esta área é exclusiva para administradores.</Text>
        <TouchableOpacity style={styles.deniedBtn} onPress={() => router.back()}>
          <Text style={styles.deniedBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statCards = stats
    ? [
        { label: 'Usuários cadastrados', value: String(stats.totalUsers), icon: Users, color: '#3B82F6' },
        { label: 'Cabanas na plataforma', value: String(stats.totalProperties), icon: Home, color: '#F59E0B' },
        { label: 'Reservas totais', value: String(stats.totalBookings), icon: TrendingUp, color: '#10B981' },
        { label: 'Anúncios pendentes', value: String(stats.pendingProperties), icon: CheckCircle, color: '#8B5CF6' },
      ]
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft color="#1F2937" size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Painel de Controle</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity style={[styles.tab, tab === 'stats' && styles.activeTab]} onPress={() => setTab('stats')}>
            <LayoutDashboard size={18} color={tab === 'stats' ? '#2D5A27' : '#9CA3AF'} />
            <Text style={[styles.tabText, tab === 'stats' && styles.activeTabText]}>Dados</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tab, tab === 'approvals' && styles.activeTab]} onPress={() => setTab('approvals')}>
            <CheckCircle size={18} color={tab === 'approvals' ? '#2D5A27' : '#9CA3AF'} />
            <Text style={[styles.tabText, tab === 'approvals' && styles.activeTabText]}>
              Aprovações{pendingCabins.length > 0 ? ` (${pendingCabins.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tab, tab === 'reports' && styles.activeTab]} onPress={() => setTab('reports')}>
            <AlertOctagon size={18} color={tab === 'reports' ? '#EF4444' : '#9CA3AF'} />
            <Text style={[styles.tabText, tab === 'reports' && { color: '#EF4444' }]}>
              Denúncias{reports.length > 0 ? ` (${reports.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tab, tab === 'highlights' && styles.activeTab]} onPress={() => setTab('highlights')}>
            <Star size={18} color={tab === 'highlights' ? '#2D5A27' : '#9CA3AF'} />
            <Text style={[styles.tabText, tab === 'highlights' && styles.activeTabText]}>Destaques</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {tab === 'stats' && (
          <View>
            <Text style={styles.sectionTitle}>Estatísticas da Plataforma</Text>
            {loadingStats ? (
              <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.statsGrid}>
                {statCards.map((item, index) => (
                  <View key={index} style={styles.statCard}>
                    <item.icon size={24} color={item.color} />
                    <Text style={styles.statValue}>{item.value}</Text>
                    <Text style={styles.statLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Ranking: Cabanas Mais Usadas</Text>
            {loadingTop ? (
              <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
            ) : topProperties.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma cabana com reservas ainda.</Text>
            ) : (
              topProperties.map((cabin, index) => (
                <View key={cabin.id} style={styles.rankingCard}>
                  <View style={styles.rankNumber}><Text style={{ color: '#fff', fontWeight: 'bold' }}>{index + 1}</Text></View>
                  <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={styles.cabinName}>{cabin.title}</Text>
                    <Text style={styles.cabinHost}>
                      {cabin.bookings_count} reserva{cabin.bookings_count === 1 ? '' : 's'} efetuada{cabin.bookings_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Star size={16} color="#F59E0B" fill="#F59E0B" />
                    <Text style={{ fontWeight: 'bold', marginLeft: 4 }}>{cabin.rating.toFixed(1)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'approvals' && (
          <View>
            <View style={styles.subTabBar}>
              <TouchableOpacity
                style={[styles.subTab, approvalSubTab === 'pendente' && styles.subTabActive]}
                onPress={() => setApprovalSubTab('pendente')}
              >
                <Text style={[styles.subTabText, approvalSubTab === 'pendente' && styles.subTabTextActive]}>Pendentes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTab, approvalSubTab === 'ativo' && styles.subTabActive]}
                onPress={() => setApprovalSubTab('ativo')}
              >
                <Text style={[styles.subTabText, approvalSubTab === 'ativo' && styles.subTabTextActive]}>Aprovadas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTab, approvalSubTab === 'inativo' && styles.subTabActive]}
                onPress={() => setApprovalSubTab('inativo')}
              >
                <Text style={[styles.subTabText, approvalSubTab === 'inativo' && styles.subTabTextActive]}>Reprovadas</Text>
              </TouchableOpacity>
            </View>

            {approvalSubTab === 'pendente' && (
              <View>
                <Text style={styles.sectionTitle}>Anúncios Pendentes ({pendingCabins.length})</Text>
                {loadingCabins ? (
                  <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
                ) : pendingCabins.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum anúncio aguardando aprovação.</Text>
                ) : (
                  pendingCabins.map((cabin) => (
                    <View key={cabin.id} style={styles.cabinCard}>
                      <View style={styles.cabinInfo}>
                        <Text style={styles.cabinName}>{cabin.title}</Text>
                        <Text style={styles.cabinHost}>{cabin.location || 'Localização não informada'}</Text>
                        <Text style={styles.cabinPrice}>{formatCurrency(cabin.price)}/noite</Text>
                      </View>
                      <View style={styles.actionButtons}>
                        <TouchableOpacity onPress={() => handleApprove(cabin, true)}>
                          <CheckCircle size={32} color="#10B981" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleApprove(cabin, false)}>
                          <XCircle size={32} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {approvalSubTab === 'ativo' && (
              <View>
                <Text style={styles.sectionTitle}>Cabanas Aprovadas ({approvedCabins.length})</Text>
                {loadingApproved ? (
                  <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
                ) : approvedCabins.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma cabana aprovada ainda.</Text>
                ) : (
                  approvedCabins.map((cabin) => (
                    <View key={cabin.id} style={styles.cabinCard}>
                      <View style={styles.cabinInfo}>
                        <Text style={styles.cabinName}>{cabin.title}</Text>
                        <Text style={styles.cabinHost}>{cabin.location || 'Localização não informada'}</Text>
                        <Text style={styles.cabinPrice}>{formatCurrency(cabin.price)}/noite</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleApprove(cabin, false)}>
                        <XCircle size={28} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}

            {approvalSubTab === 'inativo' && (
              <View>
                <Text style={styles.sectionTitle}>Reprovadas / Inativas ({rejectedCabins.length})</Text>
                <Text style={styles.mockNotice}>
                  "Inativo" também é usado quando o próprio anfitrião exclui a cabana (schema não distingue os dois casos) - essa lista pode misturar reprovadas pelo admin com excluídas pelo dono.
                </Text>
                {loadingRejected ? (
                  <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
                ) : rejectedCabins.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma cabana reprovada/inativa.</Text>
                ) : (
                  rejectedCabins.map((cabin) => (
                    <View key={cabin.id} style={styles.cabinCard}>
                      <View style={styles.cabinInfo}>
                        <Text style={styles.cabinName}>{cabin.title}</Text>
                        <Text style={styles.cabinHost}>{cabin.location || 'Localização não informada'}</Text>
                        <Text style={styles.cabinPrice}>{formatCurrency(cabin.price)}/noite</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleApprove(cabin, true)}>
                        <CheckCircle size={28} color="#10B981" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {tab === 'reports' && (
          <View>
            <Text style={styles.sectionTitle}>Denúncias pendentes</Text>
            {loadingReports ? (
              <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
            ) : reports.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma denúncia pendente no momento.</Text>
            ) : (
              reports.map((report) => (
                <View key={report.id} style={styles.reportCard}>
                  {!!report.propertyTitle && <Text style={styles.reportTarget}>🏠 Cabana: {report.propertyTitle}</Text>}
                  {!!report.reportedUserName && (
                    <Text style={styles.reportTarget}>👤 Usuário denunciado: {report.reportedUserName}</Text>
                  )}
                  <Text style={styles.reportReporter}>Denunciado por {report.reporterName ?? 'usuário removido'}</Text>

                  <Text style={{ fontWeight: 'bold', color: '#1F2937', fontSize: 16, marginTop: 8 }}>Motivo</Text>
                  <Text style={{ color: '#EF4444', fontStyle: 'italic', marginVertical: 10 }}>"{report.reason}"</Text>
                  {!!report.details && <Text style={{ color: '#4B5563', marginBottom: 10 }}>{report.details}</Text>}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.banBtn, { flex: 1 }]} onPress={() => handleResolveReport(report)}>
                      <Text style={styles.banText}>Marcar como resolvida</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.archiveBtn, { flex: 1 }]} onPress={() => handleArchiveReport(report)}>
                      <Text style={styles.archiveText}>Arquivar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'highlights' && (
          <View>
            <Text style={styles.sectionTitle}>Destaques da Explorar</Text>
            <Text style={{ color: '#6B7280', marginBottom: 20 }}>
              Marque quais cabanas ficam em destaque (properties.featured). A tela Explorar ainda não lê esse campo pra decidir o que mostrar - isso aqui é só o controle do lado do admin; a próxima etapa é a Explorar consumir isso.
            </Text>
            {loadingFeaturedList ? (
              <ActivityIndicator size="large" color="#2D5A27" style={{ marginVertical: 20 }} />
            ) : featuredList.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma cabana aprovada ainda pra destacar.</Text>
            ) : (
              featuredList.map((cabin) => (
                <View key={cabin.id} style={styles.cabinCard}>
                  <View style={styles.cabinInfo}>
                    <Text style={styles.cabinName}>{cabin.title}</Text>
                    <Text style={styles.cabinHost}>{cabin.location || 'Localização não informada'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleToggleFeatured(cabin)} disabled={togglingFeaturedId === cabin.id}>
                    <Star size={28} color="#F59E0B" fill={cabin.featured ? '#F59E0B' : 'none'} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: 60, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },

  deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: '#fff' },
  deniedTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginTop: 16 },
  deniedText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  deniedBtn: { backgroundColor: '#2D5A27', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  deniedBtnText: { color: '#fff', fontWeight: 'bold' },

  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, paddingHorizontal: 20, gap: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#2D5A27' },
  tabText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  activeTabText: { color: '#2D5A27' },

  subTabBar: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4, marginBottom: 20 },
  subTab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  subTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  subTabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  subTabTextActive: { color: '#2D5A27' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#374151' },
  mockNotice: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: -14, marginBottom: 14 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingVertical: 30 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { backgroundColor: '#fff', width: '48%', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 15 },
  statValue: { fontSize: 24, fontWeight: 'bold', marginVertical: 8 },
  statLabel: { fontSize: 12, color: '#6B7280' },

  rankingCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  rankNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#2D5A27', justifyContent: 'center', alignItems: 'center' },

  cabinCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  cabinInfo: { flex: 1 },
  cabinName: { fontSize: 16, fontWeight: 'bold' },
  cabinHost: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  cabinPrice: { fontSize: 14, color: '#2D5A27', fontWeight: '700', marginTop: 4 },
  actionButtons: { flexDirection: 'row', gap: 15 },

  reportCard: { backgroundColor: '#FEF2F2', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#FEE2E2', marginBottom: 15 },
  reportTarget: { fontSize: 13, color: '#1F2937', fontWeight: '600', marginBottom: 4 },
  reportReporter: { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
  banBtn: { backgroundColor: '#EF4444', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  banText: { color: '#fff', fontWeight: 'bold' },
  archiveBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  archiveText: { color: '#4B5563', fontWeight: 'bold' },
});
