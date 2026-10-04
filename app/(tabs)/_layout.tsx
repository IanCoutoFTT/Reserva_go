import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';

/**
 * Componente auxiliar para renderizar os ícones da barra inferior
 */
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        // Define a cor do ícone quando a aba está selecionada
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // Mantém o título no topo por padrão (exceto na Home)
        headerShown: false,
        tabBarStyle: { 
          height: 65, 
          paddingBottom: 10,
          paddingTop: 5 
        }
      }}>
      
      {/* 1. EXPLORAR: Aberto para todos (Convidados e Logados) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explorar',
          headerShown: false, // Escondemos o header aqui para usar sua barra de busca personalizada
          tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
        }}
      />

      {/* 2. FAVORITOS: Acesso livre para ver, login solicitado ao tentar favoritar */}
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favoritos',
          tabBarIcon: ({ color }) => <TabBarIcon name="heart" color={color} />,
        }}
      />

      {/* 3. MENSAGENS: Mostra exemplo ou tela de login se deslogado */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensagens',
          tabBarIcon: ({ color }) => <TabBarIcon name="comment" color={color} />,
        }}
      />

      {/* 4. VIAGENS: Onde aparecem as reservas confirmadas */}
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Viagens',
          tabBarIcon: ({ color }) => <TabBarIcon name="briefcase" color={color} />,
        }}
      />

      {/* 5. PERFIL: O portal para se tornar Anfitrião ou Admin */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}