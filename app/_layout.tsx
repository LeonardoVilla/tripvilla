import NetInfo from '@react-native-community/netinfo';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { getDb } from '@/services/db';
import { pullFromFirestore, pushQueueToFirestore } from '@/services/syncService';

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { user, loading: authLoading } = useAuth();
  const dbInitialized = useRef(false);

  // Initialize SQLite and pull Firestore data on first login
  useEffect(() => {
    if (user && !dbInitialized.current) {
      dbInitialized.current = true;
      getDb()
        .then(() => pullFromFirestore(user.uid))
        .catch(() => {});
    }
    if (!user) {
      dbInitialized.current = false;
    }
  }, [user]);

  // Push pending sync queue whenever connectivity is restored
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && user) {
        pushQueueToFirestore(user.uid).catch(() => {});
      }
    });
    return unsubscribe;
  }, [user]);

  // Auth redirect guard
  useEffect(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!user && !inAuthGroup) {
      router.replace('/auth/login');
      return;
    }

    if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [authLoading, user, segments, router]);

  // Aguarda resolução do estado de autenticação antes de renderizar
  if (authLoading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <>
        <Stack>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dayplan/[id]" options={{ headerShown: false }} />
        </Stack>
        <Toast />
      </>
    </ThemeProvider>
  );
}

