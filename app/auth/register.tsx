import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
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

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Campos obrigatórios',
        text2: 'Preencha email e senha para cadastrar.',
      });
      return;
    }
    if (password.trim().length < 6) {
      Toast.show({
        type: 'error',
        text1: 'Senha inválida',
        text2: 'A senha precisa ter pelo menos 6 caracteres.',
      });
      return;
    }
    try {
      setLoading(true);
      const auth = getAuth(firebaseApp);
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Redirecionamento feito pelo guard em _layout.tsx
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Falha no cadastro',
        text2: getFirebaseErrorMessage(error, 'Não foi possível criar a conta.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Cabeçalho */}
        <View style={styles.logoArea}>
          <Ionicons name="person-add-outline" size={48} color={TEAL} />
          <Text style={styles.appName}>Criar Conta</Text>
          <Text style={styles.subtitle}>Preencha os dados para começar</Text>
        </View>

        {/* Formulário */}
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor="#aaa"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
            </Pressable>
          </View>

          <Pressable
            style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Criar conta</Text>
            )}
          </Pressable>

          <Pressable style={styles.btnSecondary} onPress={() => router.back()}>
            <Text style={styles.btnSecondaryText}>Já tenho conta. Entrar</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  appName: { fontSize: 28, fontWeight: '800', color: TEAL, marginTop: 10 },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4, textAlign: 'center' },
  form: {},
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dde8e6',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  btnPrimary: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { alignItems: 'center', paddingVertical: 10 },
  btnSecondaryText: { color: TEAL, fontSize: 14, fontWeight: '600' },
});