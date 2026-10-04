import React, { createContext, useState, useContext, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { addFavorite, getFavorites, removeFavorite } from '../services/favoriteService';

interface FavoritesContextData {
  favorites: string[];
  toggleFavorite: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextData>({
  favorites: [],
  toggleFavorite: () => {},
});

const STORAGE_KEY = '@reservago:favorites';

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const { user } = useAuth();

  // Usuário estático (__DEV__) não existe em profiles/auth - fica só no
  // AsyncStorage, como sempre funcionou.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');

  // Carrega favoritos quando o usuário loga
  useEffect(() => {
    if (user) {
      loadFavorites();
    } else {
      setFavorites([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadFavorites = async () => {
    // Lê o cache local primeiro - garante algo na tela mesmo offline ou
    // antes da resposta do Supabase chegar (evita "piscar" lista vazia).
    let cached: string[] = [];
    try {
      const stored = await AsyncStorage.getItem(`${STORAGE_KEY}:${user?.id}`);
      if (stored) cached = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar favoritos do cache:', e);
    }
    setFavorites(cached);

    if (isStaticUser || !user?.id) return;

    const { data, error } = await getFavorites(user.id);
    if (error || !data) {
      console.log('[favorites] getFavorites falhou, mantendo cache local ->', error);
      return;
    }
    // Banco é a fonte de verdade quando online - substitui o cache e
    // regrava o AsyncStorage pra ele ficar atualizado offline também.
    setFavorites(data);
    saveCache(data);
  };

  const saveCache = async (newFavorites: string[]) => {
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEY}:${user?.id}`,
        JSON.stringify(newFavorites)
      );
    } catch (e) {
      console.error('Erro ao salvar favoritos no cache:', e);
    }
  };

  const toggleFavorite = (id: string) => {
    if (!user) {
      if (Platform.OS === 'web') {
        window.alert('Faça login para salvar seus lugares favoritos.');
      } else {
        Alert.alert(
          'Login necessário',
          'Faça login para salvar seus lugares favoritos.',
          [{ text: 'Cancelar', style: 'cancel' }]
        );
      }
      return;
    }

    const isRemoving = favorites.includes(id);
    const updated = isRemoving
      ? favorites.filter(favId => favId !== id)
      : [...favorites, id];

    // Otimista: atualiza estado + cache local na hora, funciona offline e
    // fica responsivo mesmo esperando a resposta do Supabase.
    setFavorites(updated);
    saveCache(updated);

    if (isStaticUser) return;

    const remoteCall = isRemoving ? removeFavorite(user.id, id) : addFavorite(user.id, id);
    remoteCall.then(({ error }) => {
      if (error) {
        console.log('[favorites] sincronizar com o Supabase falhou, mantendo só local ->', error);
      }
    });
  };

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
