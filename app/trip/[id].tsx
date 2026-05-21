import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { firebaseApp } from '@/firebaseInit';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import {
    addTripItem,
    deleteTripItem,
    getTripItems,
    TripItem,
    updateTripItem,
} from '@/services/firestoreService';
import { getTripFixedTotal, getTripVariableTotal } from '@/services/localDb';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

function formatCurrency(value?: number) {
  const n = value ?? 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export default function TripDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: tripId, title, maxCost: maxCostParam } = useLocalSearchParams<{
    id: string;
    title: string;
    maxCost: string;
  }>();

  const maxCost = parseFloat(maxCostParam ?? '0') || 0;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TripItem[]>([]);
  const [fixedTotal, setFixedTotal] = useState(0);
  const [variableTotal, setVariableTotal] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<TripItem | null>(null);
  const [optionsItemId, setOptionsItemId] = useState<string | null>(null);

  const [type, setType] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [amount, setAmount] = useState('0,00');

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid || !tripId) return;
      const [data, fixed, variable] = await Promise.all([
        getTripItems(uid, tripId),
        getTripFixedTotal(tripId),
        getTripVariableTotal(tripId),
      ]);
      setItems(data);
      setFixedTotal(fixed);
      setVariableTotal(variable);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao carregar itens.') });
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusRefresh(loadData);

  const parseCurrency = (val: string) =>
    parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;

  const resetForm = () => {
    setEditingItem(null);
    setType('');
    setItemDesc('');
    setAmount('0,00');
  };

  const openEditModal = (item: TripItem) => {
    setEditingItem(item);
    setType(item.type ?? '');
    setItemDesc(item.description ?? '');
    setAmount(item.amount.toFixed(2).replace('.', ','));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!itemDesc.trim()) {
      Toast.show({ type: 'error', text1: 'Campo obrigatório', text2: 'Informe uma descrição.' });
      return;
    }
    try {
      setSaving(true);
      const uid = getUid();
      if (!uid) return;
      const payload = {
        type: type.trim(),
        description: itemDesc.trim(),
        amount: parseCurrency(amount),
        createdAt: editingItem?.createdAt ?? new Date().toISOString(),
      };
      if (editingItem) {
        await updateTripItem(uid, tripId, editingItem.id, payload, editingItem.firestoreId);
        Toast.show({ type: 'success', text1: 'Item atualizado!' });
      } else {
        await addTripItem(uid, tripId, payload);
        Toast.show({ type: 'success', text1: 'Item adicionado!' });
      }
      resetForm();
      setModalVisible(false);
      await loadData();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao salvar', text2: getFirebaseErrorMessage(err, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: TripItem) => {
    setOptionsItemId(null);
    const uid = getUid();
    if (!uid) return;
    try {
      await deleteTripItem(uid, tripId, item.id, item.firestoreId);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      await loadData();
      Toast.show({ type: 'success', text1: 'Item excluído.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao excluir', text2: getFirebaseErrorMessage(err, 'Não foi possível excluir.') });
    }
  };

  const totalSpent = fixedTotal + variableTotal;
  const remaining = maxCost - totalSpent;
  const pctUsed = maxCost > 0 ? Math.min((totalSpent / maxCost) * 100, 100) : 0;

  const renderItem = ({ item }: { item: TripItem }) => (
    <Pressable
      style={styles.card}
      onLongPress={() => setOptionsItemId(item.id)}
      onPress={() => setOptionsItemId(optionsItemId === item.id ? null : item.id)}
    >
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          {item.type ? <Text style={styles.itemType}>{item.type}</Text> : null}
          <Text style={styles.itemDesc}>{item.description}</Text>
        </View>
        <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
      </View>
      {optionsItemId === item.id && (
        <View style={styles.optionsRow}>
          <Pressable style={styles.optionBtn} onPress={() => { setOptionsItemId(null); openEditModal(item); }}>
            <Ionicons name="create-outline" size={18} color={TEAL} />
            <Text style={styles.optionText}>Editar</Text>
          </Pressable>
          <Pressable style={styles.optionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={18} color="#c0392b" />
            <Text style={[styles.optionText, { color: '#c0392b' }]}>Excluir</Text>
          </Pressable>
          <Pressable style={styles.optionBtn} onPress={() => setOptionsItemId(null)}>
            <Ionicons name="close-outline" size={18} color="#555" />
            <Text style={styles.optionText}>Fechar</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title ?? 'Detalhes da Viagem'}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Budget summary */}
      <View style={styles.budgetCard}>
        <View style={styles.budgetRow}>
          <View style={styles.budgetCol}>
            <Text style={styles.budgetLabel}>Orçamento</Text>
            <Text style={styles.budgetValue}>{formatCurrency(maxCost)}</Text>
          </View>
          <View style={styles.budgetCol}>
            <Text style={styles.budgetLabel}>Fixos</Text>
            <Text style={styles.budgetValue}>{formatCurrency(fixedTotal)}</Text>
          </View>
          <View style={styles.budgetCol}>
            <Text style={styles.budgetLabel}>Variáveis</Text>
            <Text style={styles.budgetValue}>{formatCurrency(variableTotal)}</Text>
          </View>
          <View style={styles.budgetCol}>
            <Text style={styles.budgetLabel}>Saldo</Text>
            <Text style={[styles.budgetValue, { color: remaining >= 0 ? TEAL : '#c0392b' }]}>
              {formatCurrency(remaining)}
            </Text>
          </View>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pctUsed}%` as any, backgroundColor: pctUsed > 90 ? '#c0392b' : TEAL }]} />
        </View>
        <Text style={styles.pctText}>{pctUsed.toFixed(1)}% do orçamento utilizado</Text>
      </View>

      <Text style={styles.sectionTitle}>Custos Fixos</Text>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <Text style={styles.empty}>Nenhum custo fixo cadastrado.{'\n'}Toque em + para adicionar passagem, hospedagem, etc.</Text>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => { resetForm(); setModalVisible(true); }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editingItem ? 'Editar Custo' : 'Novo Custo Fixo'}</Text>

              <Text style={styles.label}>Tipo (ex: Passagem, Hospedagem, Passeio)</Text>
              <TextInput
                style={styles.input}
                value={type}
                onChangeText={setType}
                placeholder="Passagem"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>Descrição *</Text>
              <TextInput
                style={styles.input}
                value={itemDesc}
                onChangeText={setItemDesc}
                placeholder="Ex: Voo GRU → EZE"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>Valor (R$)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#aaa"
              />

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => { resetForm(); setModalVisible(false); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#ddd',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#222' },
  budgetCard: {
    backgroundColor: '#fff', margin: 12, borderRadius: 14, padding: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  budgetCol: { alignItems: 'center', flex: 1 },
  budgetLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  budgetValue: { fontSize: 14, fontWeight: '700', color: '#222' },
  progressBg: { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  pctText: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#555', marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 10, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemType: { fontSize: 11, color: TEAL, fontWeight: '600', textTransform: 'uppercase' },
  itemDesc: { fontSize: 14, color: '#222', marginTop: 2 },
  itemAmount: { fontSize: 16, fontWeight: '700', color: '#333', marginLeft: 8 },
  optionsRow: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  optionText: { fontSize: 14, color: TEAL },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, lineHeight: 24 },
  fab: {
    position: 'absolute', right: 20, backgroundColor: TEAL,
    width: 56, height: 56, borderRadius: 28, alignItems: 'center',
    justifyContent: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' },
  label: { fontSize: 13, color: '#555', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#222', backgroundColor: '#fafafa',
  },
  saveBtn: {
    backgroundColor: TEAL, borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12, marginTop: 4 },
  cancelBtnText: { color: '#888', fontSize: 14 },
});
