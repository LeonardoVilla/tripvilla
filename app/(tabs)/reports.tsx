import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, signOut } from 'firebase/auth';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firebaseApp } from '@/firebaseInit';
import { DayPlan, getUserDayPlans } from '@/services/firestoreService';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCurrency(value?: number) {
  const n = value ?? 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export default function ReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<DayPlan[]>([]);

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid) return;
      const data = await getUserDayPlans(uid);
      setPlans(data);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar relatorios.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    try {
      await signOut(getAuth(firebaseApp));
      router.replace('/auth/login');
    } catch {}
  };

  // Summary calculations
  const totalGasto = plans.reduce((acc, p) => acc + (p.totalSpent ?? 0), 0);
  const totalParadas = plans.reduce((acc, p) => acc + (p.itemCount ?? 0), 0);
  const mediaGasto = plans.length > 0 ? totalGasto / plans.length : 0;
  const planMaisCaro = plans.reduce<DayPlan | null>(
    (best, p) => (p.totalSpent ?? 0) > (best?.totalSpent ?? 0) ? p : best,
    null,
  );

  // Sort by totalSpent descending for the list
  const sortedPlans = [...plans].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Relatorios</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={loadData} style={styles.iconBtn}>
            <Ionicons name="sync-outline" size={24} color="#333" />
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={24} color="#333" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sortedPlans}
          keyExtractor={(item) => `${item._source}-${item.id}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {/* Summary cards */}
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
                  <Text style={styles.summaryLabel}>Media por role</Text>
                </View>
                <View style={[styles.summaryCard, { flex: 1, marginLeft: 10 }]}>
                  <Ionicons name="trophy-outline" size={22} color={TEAL} />
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {planMaisCaro?.title ?? '-'}
                  </Text>
                  <Text style={styles.summaryLabel}>Role mais caro</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Gastos por role</Text>
            </>
          }
          renderItem={({ item, index }) => {
            const pct = totalGasto > 0 ? ((item.totalSpent ?? 0) / totalGasto) * 100 : 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.title ?? 'Sem titulo'}
                    </Text>
                    <Text style={styles.cardDate}>Data: {formatDate(item.date)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardAmount}>{formatCurrency(item.totalSpent)}</Text>
                    <Text style={styles.cardStops}>{item.itemCount ?? 0} paradas</Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.pctLabel}>{pct.toFixed(1)}% do total</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bar-chart-outline" size={48} color="#ccc" />
              <Text style={styles.empty}>Nenhum dado de gasto encontrado.</Text>
              <Text style={styles.emptySub}>Crie roles e adicione locais para ver os relatorios.</Text>
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  list: { padding: 12, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', marginBottom: 10 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginTop: 6, textAlign: 'center' },
  summaryLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  cardDate: { fontSize: 12, color: '#888', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: 15, fontWeight: '700', color: TEAL },
  cardStops: { fontSize: 11, color: '#888', marginTop: 2 },
  barBg: { height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: TEAL, borderRadius: 3 },
  pctLabel: { fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'right' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  empty: { fontSize: 15, color: '#888', marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#aaa', marginTop: 6, textAlign: 'center' },
});

