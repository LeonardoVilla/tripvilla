import { router } from 'expo-router';
import { useEffect } from 'react';

export default function AuthIndex() {
  useEffect(() => {
    router.replace('/auth/login');
  }, []);
  return null;
}
