import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

export type MenuItemProps = {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
  showBadge?: boolean;
};

export function MenuItem({ icon: Icon, title, subtitle, onPress, color = '#4B5563', showBadge = false }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIconContainer}>
        <Icon size={22} color={color} />
        {showBadge && <View style={styles.notificationBadge} />}
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={[styles.menuTitle, color === '#EF4444' && { color: '#EF4444' }]}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <ChevronRight size={18} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  menuIconContainer: { marginRight: 15, position: 'relative' },
  notificationBadge: {
    position: 'absolute', top: -2, right: -2, width: 10, height: 10,
    borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#fff',
  },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: '500', color: '#374151' },
  menuSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
});
