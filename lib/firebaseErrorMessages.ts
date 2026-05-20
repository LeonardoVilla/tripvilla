import { FirebaseError } from 'firebase/app';

const firebaseErrorMap: Record<string, string> = {
  'auth/invalid-email': 'Email invalido. Verifique o formato informado.',
  'auth/user-disabled': 'Este usuario foi desativado.',
  'auth/user-not-found': 'Usuario nao encontrado para este email.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-credential': 'Email ou senha invalidos.',
  'auth/email-already-in-use': 'Este email ja esta em uso.',
  'auth/weak-password': 'Senha fraca. Use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
  'auth/network-request-failed': 'Falha de rede. Verifique sua conexao.',
  'permission-denied': 'Sem permissao para acessar estes dados no Firestore.',
  'unavailable': 'Servico do Firestore indisponivel no momento.',
};

export function getFirebaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    return firebaseErrorMap[error.code] ?? fallback;
  }

  return fallback;
}
