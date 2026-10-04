import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../context/AuthContext';
import { BookingProvider } from '../context/BookingContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { NotificationProvider } from '../context/NotificationContext';
import { ListingProvider } from '../context/ListingContext';
import { useColorScheme } from '../components/useColorScheme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => { if (error) throw error; }, [error]);
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BookingProvider>
          <FavoritesProvider>
            <NotificationProvider>
              <ListingProvider>
                <RootLayoutNav />
              </ListingProvider>
            </NotificationProvider>
          </FavoritesProvider>
        </BookingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName="(tabs)">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="select-role" options={{ headerShown: false }} />
        <Stack.Screen name="create-listing" options={{ title: 'Anunciar Cabana', headerShown: true, headerTitleStyle: { fontWeight: 'bold' }, headerTintColor: '#2D5A27' }} />
        <Stack.Screen name="details" options={{ headerShown: false }} />
        <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
        {/* ✅ Nova rota de notificações */}
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="oauth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="review" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}