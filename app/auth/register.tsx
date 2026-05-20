import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { firebaseApp } from '@/firebaseInit';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = getAuth(firebaseApp);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Campos obrigatorios',
        text2: 'Preencha email e senha para cadastrar.',
      });
      return;
    }

    if (password.trim().length < 6) {
      Toast.show({
        type: 'error',
        text1: 'Senha invalida',
        text2: 'A senha precisa ter pelo menos 6 caracteres.',
      });
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace('/(tabs)/places');
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Falha no cadastro',
        text2: getFirebaseErrorMessage(error, 'Nao foi possivel criar a conta.'),
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar Conta</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="Registrar" onPress={handleRegister} />
      <Button title="Já tenho conta" onPress={() => router.push('/auth/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16 },
});