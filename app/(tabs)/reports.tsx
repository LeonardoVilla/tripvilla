import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { BG, shadowCard, TEAL } from '@/constants/AppTheme';
import { useAuth } from '@/context/AuthContext';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { DayPlan, DayPlanItem, getDayPlanItems, getUserDayPlans, getUserTrips, Trip } from '@/services/firestoreService';
import { Buddy, getLocalBuddies, getTripFixedTotal, getTripVariableTotal } from '@/services/localDb';
import { pullFromFirestore } from '@/services/syncService';
import { formatCurrency, formatDate } from '@/utils/format';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [itemsMap, setItemsMap] = useState<Record<string, DayPlanItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripTotals, setTripTotals] = useState<Record<string, { fixed: number; variable: number }>>();
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [expandedBuddies, setExpandedBuddies] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;
      const [data, tripData, buds] = await Promise.all([
        getUserDayPlans(user.uid),
        getUserTrips(user.uid),
        getLocalBuddies(user.uid),
      ]);
      setPlans(data);
      setTrips(tripData);
      setBuddies(buds);
      const totals: Record<string, { fixed: number; variable: number }> = {};
      await Promise.all(
        tripData.map(async (t) => {
          const [fixed, variable] = await Promise.all([
            getTripFixedTotal(t.id),
            getTripVariableTotal(t.id),
          ]);
          totals[t.id] = { fixed, variable };
        }),
      );
      setTripTotals(totals);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar relatórios.'),
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleSync = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;
      await pullFromFirestore(user.uid);
      const [data, tripData, buds] = await Promise.all([
        getUserDayPlans(user.uid),
        getUserTrips(user.uid),
        getLocalBuddies(user.uid),
      ]);
      setPlans(data);
      setTrips(tripData);
      setBuddies(buds);
      const totals: Record<string, { fixed: number; variable: number }> = {};
      await Promise.all(
        tripData.map(async (t) => {
          const [fixed, variable] = await Promise.all([
            getTripFixedTotal(t.id),
            getTripVariableTotal(t.id),
          ]);
          totals[t.id] = { fixed, variable };
        }),
      );
      setTripTotals(totals);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao sincronizar.') });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusRefresh(handleSync);

  const toggleExpand = async (plan: DayPlan) => {
    if (!user) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedIds.has(plan.id)) {
      setExpandedIds((prev) => { const s = new Set(prev); s.delete(plan.id); return s; });
      return;
    }
    setExpandedIds((prev) => new Set(prev).add(plan.id));
    if (!itemsMap[plan.id]) {
      setLoadingItems((prev) => new Set(prev).add(plan.id));
      try {
        const items = await getDayPlanItems(user.uid, plan.id, plan._source);
        setItemsMap((prev) => ({ ...prev, [plan.id]: items }));
      } catch {
        Toast.show({ type: 'error', text1: 'Erro ao carregar detalhes.' });
      } finally {
        setLoadingItems((prev) => { const s = new Set(prev); s.delete(plan.id); return s; });
      }
    }
  };

  const toggleBuddies = (tripId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedBuddies((prev) => {
      const next = new Set(prev);
      next.has(tripId) ? next.delete(tripId) : next.add(tripId);
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/auth/login');
    } catch {}
  };

  // ── Trip list view ──────────────────────────────────────────────────────────

  const renderTripCard = ({ item }: { item: Trip }) => {
    const isShared = !!item.ownerUid;
    const tripBuddies = buddies.filter(
      (b) => b.tripIds.includes(item.firestoreId ?? '') || b.tripIds.includes(item.id),
    );
    const buddiesExpanded = expandedBuddies.has(item.id);

    return (
      <View style={styles.card}>
        <Pressable onPress={() => setSelectedTrip(item)} style={styles.cardPressable}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              {isShared && (
                <View style={styles.sharedBadge}>
                  <Ionicons name="people-outline" size={11} color="#fff" />
                  <Text style={styles.sharedBadgeText}>Compartilhada</Text>
                </View>
              )}
              <Text style={styles.cardTitle}>{item.description ?? '(sem título)'}</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color="#aaa" />
          </View>
          {item.country ? (
            <Text style={styles.cardSub}>{item.country}</Text>
          ) : null}
          <Text style={styles.cardBudget}>Orçamento: {formatCurrency(item.maxCost)}</Text>
        </Pressable>

        {!isShared && (
          <Pressable style={styles.buddiesToggle} onPress={() => toggleBuddies(item.id)}>
            <Ionicons name="people-outline" size={14} color={TEAL} />
            <Text style={styles.buddiesToggleText}>
              Trip Buddies ({tripBuddies.length})
            </Text>
            <Ionicons name={buddiesExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={14} color={TEAL} />
          </Pressable>
        )}

        {!isShared && buddiesExpanded && (
          <View style={styles.buddiesList}>
            {tripBuddies.length === 0 ? (
              <Text style={styles.buddiesEmpty}>Nenhum buddy nesta viagem.</Text>
            ) : (
              tripBuddies.map((b) => (
                <View key={b.id} style={styles.buddyRow}>
                  <Ionicons name="person-circle-outline" size={18} color="#888" />
                  <Text style={styles.buddyEmail}>{b.email}</Text>
                  <View style={[styles.buddyRoleBadge, b.role === 'admin' ? styles.buddyRoleAdmin : styles.buddyRoleUser]}>
                    <Text style={styles.buddyRoleText}>{b.role === 'admin' ? 'Planejador' : 'Passageiro'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Report detail view ──────────────────────────────────────────────────────

  const renderReportDetail = (trip: Trip) => {
    const tripPlans = plans.filter(
      (p) => p.tripId === trip.id || p.tripId === trip.firestoreId,
    );
    const sortedPlans = [...tripPlans].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0));
    const totalGasto = tripPlans.reduce((acc, p) => acc + (p.totalSpent ?? 0), 0);
    const totalParadas = tripPlans.reduce((acc, p) => acc + (p.itemCount ?? 0), 0);
    const mediaGasto = tripPlans.length > 0 ? totalGasto / tripPlans.length : 0;
    const planMaisCaro = tripPlans.reduce<DayPlan | null>(
      (best, p) => (p.totalSpent ?? 0) > (best?.totalSpent ?? 0) ? p : best,
      null,
    );
    const fixed = tripTotals?.[trip.id]?.fixed ?? 0;
    const variable = tripTotals?.[trip.id]?.variable ?? 0;
    const total = fixed + variable;
    const remaining = (trip.maxCost ?? 0) - total;
    const pct = (trip.maxCost ?? 0) > 0 ? Math.min((total / trip.maxCost!) * 100, 100) : 0;

    return (
      <FlatList
        data={sortedPlans}
        keyExtractor={(item) => `${item._source}-${item.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { flex: 1 }]}>
                <Ionicons name="cash-outline" size={22} color={TEAL} />
                <Text style={styles.summaryValue}>{formatCurrency(totalGasto)}</Text>
                <Text style={styles.summaryLabel}>Total gasto</Text>
              </View>
              <View style={[styles.summaryCard, { flex: 1, marginLeft: 10 }]}>
                <Ionicons name="location-outline" size={22} color={TEAL} />
                <Text style={styles.summaryValue}>{totalParadas}</Text>
                <Text style={styles.summaryLabel}>Total de paradas</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { flex: 1 }]}>
                <Ionicons name="analytics-outline" size={22} color={TEAL} />
                <Text style={styles.summaryValue}>{formatCurrency(mediaGasto)}</Text>
                <Text style={styles.summaryLabel}>Média por role</Text>
              </View>
              <View style={[styles.summaryCard, { flex: 1, marginLeft: 10 }]}>
                <Ionicons name="trophy-outline" size={22} color={TEAL} />
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {planMaisCaro?.title ?? '-'}
                </Text>
                <Text style={styles.summaryLabel}>Role mais caro</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Resumo da Viagem</Text>
            <View style={styles.tripSummaryCard}>
              <View style={styles.tripBudgetRow}>
                <View style={styles.tripBudgetCol}>
                  <Text style={styles.budgetLabel}>Orçamento</Text>
                  <Text style={styles.budgetValue}>{formatCurrency(trip.maxCost)}</Text>
                </View>
                <View style={styles.tripBudgetCol}>
                  <Text style={styles.budgetLabel}>Fixos</Text>
                  <Text style={styles.budgetValue}>{formatCurrency(fixed)}</Text>
                </View>
                <View style={styles.tripBudgetCol}>
                  <Text style={styles.budgetLabel}>Variáveis</Text>
                  <Text style={styles.budgetValue}>{formatCurrency(variable)}</Text>
                </View>
                <View style={styles.tripBudgetCol}>
                  <Text style={styles.budgetLabel}>Saldo</Text>
                  <Text style={[styles.budgetValue, { color: remaining >= 0 ? TEAL : '#c0392b' }]}>
                    {formatCurrency(remaining)}
                  </Text>
                </View>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: pct > 90 ? '#c0392b' : TEAL }]} />
              </View>
              <Text style={styles.pctLabel}>{pct.toFixed(1)}% do orçamento utilizado</Text>
            </View>

            {sortedPlans.length > 0 && (
              <Text style={styles.sectionTitle}>Gastos por role</Text>
            )}
          </>
        }
        renderItem={({ item, index }) => {
          const pctItem = totalGasto > 0 ? ((item.totalSpent ?? 0) / totalGasto) * 100 : 0;
          const isExpanded = expandedIds.has(item.id);
          const isLoadingItems = loadingItems.has(item.id);
          const details = itemsMap[item.id] ?? [];
          return (
            <View style={styles.roleCard}>
              <View style={styles.cardTop}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.title ?? 'Sem título'}
                  </Text>
                  <Text style={styles.cardDate}>Data: {formatDate(item.date)}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.cardAmount}>{formatCurrency(item.totalSpent)}</Text>
                  <Text style={styles.cardStops}>{item.itemCount ?? 0} paradas</Text>
                </View>
                <Pressable onPress={() => toggleExpand(item)} style={styles.expandBtn} hitSlop={8}>
                  <Ionicons
                    name={isExpanded ? 'remove-circle-outline' : 'add-circle-outline'}
                    size={22}
                    color={TEAL}
                  />
                </Pressable>
              </View>

              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pctItem}%` }]} />
              </View>
              <Text style={styles.pctLabel}>{pctItem.toFixed(1)}% do total</Text>

              {isExpanded && (
                <View style={styles.detailsContainer}>
                  <View style={styles.detailsDivider} />
                  {isLoadingItems ? (
                    <ActivityIndicator size="small" color={TEAL} style={{ marginVertical: 8 }} />
                  ) : details.length === 0 ? (
                    <Text style={styles.detailsEmpty}>Nenhuma visita registrada.</Text>
                  ) : (
                    details.map((detail) => (
                      <View key={detail.id} style={styles.detailItem}>
                        <View style={styles.detailDot} />
                        <View style={styles.detailInfo}>
                          <Text style={styles.detailName} numberOfLines={1}>
                            {detail.placeName ?? 'Local sem nome'}
                          </Text>
                          {detail.placeLocation ? (
                            <Text style={styles.detailLocation} numberOfLines={1}>
                              {detail.placeLocation}
                            </Text>
                          ) : null}
                          <View style={styles.detailRow}>
                            {detail.arrivalTime ? (
                              <Text style={styles.detailTime}>
                                <Ionicons name="time-outline" size={11} color="#888" /> {detail.arrivalTime}
                                {detail.leaveTime ? ` – ${detail.leaveTime}` : ''}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {(detail.amountSpent ?? 0) > 0 && detail.visited !== false && (
                          <Text style={styles.detailAmount}>
                            {formatCurrency(detail.amountSpent)}
                          </Text>
                        )}
                        {detail.visited === false && (
                          <Text style={[styles.detailAmount, { color: '#bbb', textDecorationLine: 'line-through' }]}>
                            Não visitado
                          </Text>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
            <Text style={styles.empty}>Nenhum role cadastrado para esta viagem.</Text>
          </View>
        }
      />
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {selectedTrip ? (
          <Pressable onPress={() => setSelectedTrip(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={22} color="#333" />
          </Pressable>
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {selectedTrip ? selectedTrip.description ?? 'Relatório' : 'Relatórios'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleSync} style={styles.iconBtn}>
            <Ionicons name="sync-outline" size={24} color="#333" />
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={24} color="#333" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : selectedTrip ? (
        renderReportDetail(selectedTrip)
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTripCard}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
              <Text style={styles.empty}>Nenhuma viagem encontrada.</Text>
              <Text style={styles.emptySub}>Crie uma viagem para ver os relatórios.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: BG,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  backBtn: { marginRight: 8 },
  list: { padding: 12, paddingBottom: 40 },
  // Trip card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    ...shadowCard,
  },
  cardPressable: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  cardSub: { fontSize: 13, color: '#888', marginBottom: 4 },
  cardBudget: { fontSize: 13, color: '#555', fontWeight: '500' },
  sharedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4,
  },
  sharedBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  // Buddies collapse
  buddiesToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  buddiesToggleText: { flex: 1, fontSize: 13, color: TEAL, fontWeight: '600' },
  buddiesList: { paddingHorizontal: 14, paddingBottom: 10 },
  buddiesEmpty: { fontSize: 12, color: '#aaa', fontStyle: 'italic' },
  buddyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  buddyEmail: { flex: 1, fontSize: 13, color: '#333' },
  buddyRoleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  buddyRoleAdmin: { backgroundColor: TEAL },
  buddyRoleUser: { backgroundColor: '#95a5a6' },
  buddyRoleText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  // Summary cards
  summaryRow: { flexDirection: 'row', marginBottom: 10 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    ...shadowCard,
  },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginTop: 6, textAlign: 'center' },
  summaryLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, marginTop: 4 },
  // Trip summary
  tripSummaryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
    ...shadowCard,
  },
  tripBudgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  tripBudgetCol: { alignItems: 'center', flex: 1 },
  budgetLabel: { fontSize: 10, color: '#888', marginBottom: 2 },
  budgetValue: { fontSize: 13, fontWeight: '700', color: '#222' },
  barBg: { height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: TEAL, borderRadius: 3 },
  pctLabel: { fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'right' },
  // Role cards
  roleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    ...shadowCard,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rankBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  rankText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  cardDate: { fontSize: 12, color: '#888', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 15, fontWeight: '700', color: TEAL },
  cardStops: { fontSize: 11, color: '#888', marginTop: 2 },
  expandBtn: { marginLeft: 8 },
  detailsContainer: { marginTop: 10 },
  detailsDivider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 10 },
  detailsEmpty: { fontSize: 12, color: '#aaa', textAlign: 'center', paddingVertical: 6 },
  detailItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  detailDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: TEAL, marginTop: 4, marginRight: 10, flexShrink: 0,
  },
  detailInfo: { flex: 1 },
  detailName: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  detailLocation: { fontSize: 11, color: '#888', marginTop: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  detailTime: { fontSize: 11, color: '#888' },
  detailAmount: { fontSize: 13, fontWeight: '700', color: TEAL, marginLeft: 8 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  empty: { fontSize: 15, color: '#888', marginTop: 12, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#aaa', marginTop: 6, textAlign: 'center' },
});
