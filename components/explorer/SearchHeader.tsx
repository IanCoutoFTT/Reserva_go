import React, { RefObject } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Keyboard } from 'react-native';
import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import { CATEGORIES, PriceRange, IsolationOption } from './exploreConstants';

export type SearchHeaderProps = {
  inputRef: RefObject<TextInput | null>;
  isSearching: boolean;
  searchQuery: string;
  onChangeSearchQuery: (value: string) => void;
  onFocusSearch: () => void;
  onCancelSearch: () => void;
  onClearSearchQuery: () => void;

  activeFiltersCount: number;
  onOpenFilterModal: () => void;

  selectedPriceRange: PriceRange;
  onClearPriceRange: () => void;
  selectedIsolation: IsolationOption;
  onClearIsolation: () => void;

  selectedCategory: string;
  onSelectCategory: (name: string) => void;
};

export function SearchHeader({
  inputRef, isSearching, searchQuery, onChangeSearchQuery, onFocusSearch, onCancelSearch, onClearSearchQuery,
  activeFiltersCount, onOpenFilterModal,
  selectedPriceRange, onClearPriceRange, selectedIsolation, onClearIsolation,
  selectedCategory, onSelectCategory,
}: SearchHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.searchBar, isSearching && styles.searchBarActive]}
          onPress={() => inputRef.current?.focus()}
        >
          <Search size={18} color="#6B7280" style={{ marginRight: 10 }} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Buscar cabanas, lugares..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={onChangeSearchQuery}
            onFocus={onFocusSearch}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={onClearSearchQuery} style={{ padding: 5 }}>
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {isSearching ? (
          <TouchableOpacity onPress={onCancelSearch} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.filterButton} onPress={onOpenFilterModal}>
            <SlidersHorizontal size={18} color={activeFiltersCount > 0 ? '#fff' : '#2D5A27'} />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {!isSearching && activeFiltersCount > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeFiltersRow}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {selectedPriceRange.id !== 'todos' && (
            <TouchableOpacity style={styles.activeFilterChip} onPress={onClearPriceRange}>
              <Text style={styles.activeFilterChipText}>{selectedPriceRange.label}</Text>
              <X size={12} color="#2D5A27" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
          {selectedIsolation.id !== 'todos' && (
            <TouchableOpacity style={styles.activeFilterChip} onPress={onClearIsolation}>
              <Text style={styles.activeFilterChipText}>
                {selectedIsolation.emoji} {selectedIsolation.label}
              </Text>
              <X size={12} color="#2D5A27" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {!isSearching && (
        <View style={styles.categoriesContainer}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryItem, selectedCategory === cat.name && styles.categoryActive]}
              onPress={() => onSelectCategory(cat.name)}
            >
              <cat.icon size={22} color={selectedCategory === cat.name ? '#2D5A27' : '#6B7280'} />
              <Text style={[styles.categoryText, selectedCategory === cat.name && styles.categoryTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 16, marginTop: 10,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 12,
    borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, borderWidth: 1, borderColor: '#F3F4F6',
  },
  searchBarActive: { borderColor: '#2D5A27' },
  searchInput: { flex: 1, fontSize: 15, color: '#1F2937', paddingVertical: 0 },
  cancelButton: { marginLeft: 12, paddingVertical: 6 },
  cancelText: { fontSize: 15, color: '#2D5A27', fontWeight: '600' },
  filterButton: {
    marginLeft: 10, width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F0F7F0', borderWidth: 1, borderColor: '#2D5A27',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  filterBadge: {
    position: 'absolute', top: -4, right: -4, width: 18, height: 18,
    borderRadius: 9, backgroundColor: '#2D5A27', justifyContent: 'center', alignItems: 'center',
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  activeFiltersRow: { marginBottom: 8 },
  activeFilterChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
    borderWidth: 1, borderColor: '#2D5A27', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  activeFilterChipText: { fontSize: 12, color: '#2D5A27', fontWeight: '600' },
  categoriesContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 0 },
  categoryItem: { alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  categoryActive: { borderBottomColor: '#2D5A27' },
  categoryText: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  categoryTextActive: { color: '#2D5A27', fontWeight: 'bold' },
});
