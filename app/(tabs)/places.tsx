import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { firebaseApp } from '@/firebaseInit';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { addUserPlace, deleteUserPlace, getUserPlaces, updateUserPlace } from '@/services/firestoreService';
import { pullFromFirestore } from '@/services/syncService';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

type Place = {
  id: string;
  firestoreId?: string | null;
  name?: string;
  location?: string;
  openingTime?: string;
  closingTime?: string;
  commuteDuration?: string;
  transportSchedule?: string;
};

export default function PlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [optionsPlaceId, setOptionsPlaceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('18:00');
  const [commuteDuration, setCommuteDuration] = useState('30 min');
  const [transportSchedule, setTransportSchedule] = useState('');

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const loadPlaces = async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid) return;
      const data = (await getUserPlaces(uid)) as Place[];
      setPlaces(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao carregar locais.') });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid) return;
      await pullFromFirestore(uid);
      const data = (await getUserPlaces(uid)) as Place[];
      setPlaces(data);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar locais.'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaces();
  }, []);

  const resetForm = () => {
    setEditingPlace(null);
    setName('');
    setLocation('');
    setOpeningTime('09:00');
    setClosingTime('18:00');
    setCommuteDuration('30 min');
    setTransportSchedule('');
  };

  const openEditModal = (place: Place) => {
    setEditingPlace(place);
    setName(place.name ?? '');
    setLocation(place.location ?? '');
    setOpeningTime(place.openingTime ?? '09:00');
    setClosingTime(place.closingTime ?? '18:00');
    setCommuteDuration(place.commuteDuration ?? '30 min');
    setTransportSchedule(place.transportSchedule ?? '');
    setModalVisible(true);
  };

  const handleDeletePlace = async (place: Place) => {
    setOptionsPlaceId(null);
    const uid = getUid();
    if (!uid) return;
    try {
      await deleteUserPlace(uid, place.id, place.firestoreId);
      setPlaces((prev) => prev.filter((p) => p.id !== place.id));
      Toast.show({ type: 'success', text1: 'Local excluido.' });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao excluir',
        text2: getFirebaseErrorMessage(err, 'Nao foi possivel excluir.'),
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !location.trim()) {
      Toast.show({ type: 'error', text1: 'Campos obrigatorios', text2: 'Informe nome e localizacao.' });
      return;
    }
    try {
      setSaving(true);
      const uid = getUid();
      if (!uid) {
        Toast.show({ type: 'error', text1: 'Sessao expirada', text2: 'Faca login novamente.' });
        return;
      }
      const payload = {
        name: name.trim(),
        location: location.trim(),
        openingTime,
        closingTime,
        commuteDuration,
        transportSchedule: transportSchedule.trim(),
        updatedAt: new Date().toISOString(),
      };
      if (editingPlace) {
        await updateUserPlace(uid, editingPlace.id, payload, editingPlace.firestoreId);
        Toast.show({ type: 'success', text1: 'Local atualizado!' });
      } else {
        await addUserPlace(uid, { ...payload, visited: false });
        Toast.show({ type: 'success', text1: 'Local salvo!' });
      }
      resetForm();
      setModalVisible(false);
      await loadPlaces();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao salvar',
        text2: getFirebaseErrorMessage(err, 'Nao foi possivel salvar.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(getAuth(firebaseApp));
      router.replace('/auth/login');
    } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Locais cadastrados</Text>
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
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.name ?? 'Sem nome'}</Text>
                <Text style={styles.cardDetail}>Localizacao: {item.location ?? '-'}</Text>
                {!!(item.openingTime || item.closingTime) && (
                  <Text style={styles.cardDetail}>
                    Funcionamento: {item.openingTime} - {item.closingTime}
                  </Text>
                )}
                {!!item.commuteDuration && (
                  <Text style={styles.cardDetail}>Deslocamento medio: {item.commuteDuration}</Text>
                )}
                {!!item.transportSchedule && (
                  <Text style={styles.cardDetail}>Transporte: {item.transportSchedule}</Text>
                )}
              </View>
              <View style={styles.cardActions}>
                <Ionicons name="cloud-outline" size={20} color={TEAL} />
                <Pressable style={{ marginTop: 8 }} onPress={() => setOptionsPlaceId(optionsPlaceId === item.id ? null : item.id)}>
                  <Ionicons name="ellipsis-vertical" size={20} color="#666" />
                </Pressable>
                {optionsPlaceId === item.id && (
                  <View style={styles.optionsMenu}>
                    <Pressable
                      style={styles.optionsMenuItem}
                      onPress={() => { setOptionsPlaceId(null); openEditModal(item); }}
                    >
                      <Ionicons name="create-outline" size={16} color="#333" />
                      <Text style={styles.optionsMenuText}>Editar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.optionsMenuItem}
                      onPress={() => handleDeletePlace(item)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#e53935" />
                      <Text style={[styles.optionsMenuText, { color: '#e53935' }]}>Excluir</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum local cadastrado ainda.</Text>}
        />
      )}

      <Pressable style={styles.fab} onPress={() => { resetForm(); setModalVisible(true); }}>
        <Ionicons name="location-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Novo local</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingPlace ? 'Editar local' : 'Novo local'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do local"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Localizacao / Endereco"
              value={location}
              onChangeText={setLocation}
            />
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Abre</Text>
                <TextInput style={styles.input} value={openingTime} onChangeText={setOpeningTime} />
              </View>
              <View style={[styles.half, { marginLeft: 10 }]}>
                <Text style={styles.label}>Fecha</Text>
                <TextInput style={styles.input} value={closingTime} onChangeText={setClosingTime} />
              </View>
            </View>
            <Text style={styles.label}>Tempo de deslocamento</Text>
            <TextInput style={styles.input} value={commuteDuration} onChangeText={setCommuteDuration} />
            <Text style={styles.label}>Horario de transporte</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Onibus 08:30 / 10:00"
              value={transportSchedule}
              onChangeText={setTransportSchedule}
              multiline
            />
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : editingPlace ? 'Salvar alteracoes' : 'Salvar local'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  list: { padding: 12, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  cardDetail: { fontSize: 13, color: '#555', marginBottom: 2 },
  cardActions: { alignItems: 'center', paddingLeft: 8, paddingTop: 2, position: 'relative' },
  optionsMenu: {
    position: 'absolute',
    right: 0,
    top: 28,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 120,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 100,
  },
  optionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionsMenuText: { fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 420,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, color: '#1a1a1a' },
  row: { flexDirection: 'row' },
  half: { flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 3, marginLeft: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
