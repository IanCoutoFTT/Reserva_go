import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet, Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropertyCard } from '../../components/PropertyCard';
import { FilterModal } from '../../components/explorer/FilterModal';
import { SearchHeader } from '../../components/explorer/SearchHeader';
import { ISOLATION_OPTIONS, IsolationOption, PRICE_RANGES, PriceRange, SECTIONS } from '../../components/explorer/exploreConstants';
import { mapPropertyToListing } from '../../components/explorer/mapPropertyToListing';
import { useAuth } from '../../context/AuthContext';
import { Listing, useListings } from '../../context/ListingContext';
import { getProperties } from '../../services/propertyService';

type Property = Listing;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { allProperties: localProperties = [] } = useListings() || {};

  // Usuário estático (__DEV__, ids "static-*") não existe em profiles/auth -
  // nesse caso (e se a query falhar por qualquer outro motivo) caímos pros
  // dados locais do ListingContext, pra não deixar a Explorar em branco.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const [remoteProperties, setRemoteProperties] = useState<Listing[] | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(!isStaticUser);
  // Só mostra o spinner de tela cheia antes da primeira carga - refs (não
  // state) porque é lido de dentro do callback do useFocusEffect abaixo, que
  // só é recriado quando isStaticUser muda; um state aqui ficaria "stale"
  // (sempre o valor de quando a função foi criada) nos refocos seguintes.
  const hasLoadedOnceRef = useRef(false);

  // useFocusEffect (não useEffect simples) - a aba Explorar fica montada o
  // tempo todo (React Navigation não desmonta abas ao trocar), então um
  // useEffect com `[]`/`[isStaticUser]` só busca os dados UMA vez, na
  // primeira montagem. Bug real encontrado ao vivo: cadastrar uma cabana
  // nova (ou um admin aprovar uma pendente) em outra tela não atualizava o
  // Explorar até reiniciar o app inteiro - "Nenhuma cabana disponível"
  // mesmo com cabanas reais e aprovadas no banco. Com useFocusEffect, toda
  // vez que o usuário volta pra essa aba (voltando de "Anunciar nova
  // cabana", do Painel de Controle, etc.) os dados são buscados de novo.
  useFocusEffect(
    useCallback(() => {
      if (isStaticUser) {
        setRemoteProperties(null);
        setLoadingProperties(false);
        return;
      }

      let cancelled = false;
      if (!hasLoadedOnceRef.current) setLoadingProperties(true);

      getProperties()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error || !data) {
            console.log('[index] getProperties falhou, usando fallback local ->', error);
            if (!hasLoadedOnceRef.current) setRemoteProperties(null);
          } else {
            setRemoteProperties(data.map(mapPropertyToListing));
          }
        })
        .finally(() => {
          if (cancelled) return;
          setLoadingProperties(false);
          hasLoadedOnceRef.current = true;
        });

      return () => {
        cancelled = true;
      };
    }, [isStaticUser])
  );

  const allProperties = useMemo(
    () => remoteProperties ?? localProperties,
    [remoteProperties, localProperties]
  );

  const [selectedCategory, setSelectedCategory] = useState('Praia Privativa');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isExploreAll, setIsExploreAll] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRange>(PRICE_RANGES[0]);
  const [selectedIsolation, setSelectedIsolation] = useState<IsolationOption>(ISOLATION_OPTIONS[0]);
  const [tempPriceRange, setTempPriceRange] = useState<PriceRange>(PRICE_RANGES[0]);
  const [tempIsolation, setTempIsolation] = useState<IsolationOption>(ISOLATION_OPTIONS[0]);

  const activeFiltersCount = [
    selectedPriceRange.id !== 'todos',
    selectedIsolation.id !== 'todos',
  ].filter(Boolean).length;

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearching) { cancelSearch(); return true; }
      if (isExploreAll) { setIsExploreAll(false); return true; }
      return false;
    });
    return () => backHandler.remove();
  }, [isSearching, isExploreAll]);

  const cancelSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    Keyboard.dismiss();
  };

  const selectCategory = (name: string) => {
    setSelectedCategory(name);
    setIsExploreAll(false);
  };

  const openFilterModal = () => {
    setTempPriceRange(selectedPriceRange);
    setTempIsolation(selectedIsolation);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setSelectedPriceRange(tempPriceRange);
    setSelectedIsolation(tempIsolation);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setTempPriceRange(PRICE_RANGES[0]);
    setTempIsolation(ISOLATION_OPTIONS[0]);
  };

  const applyActiveFilters = (list: Property[]) =>
    list.filter((item) => {
      const passPrice = item.price >= selectedPriceRange.min && item.price <= selectedPriceRange.max;
      const passIsolation =
        selectedIsolation.id === 'todos' ||
        (item.isolationLevel ?? '').toLowerCase() === selectedIsolation.id.toLowerCase();
      return passPrice && passIsolation;
    });

  const navigateToDetails = (item: Property) => {
    router.push({
      pathname: '/details',
      params: {
        id: item.id,
        title: item.title,
        price: item.price,
        location: item.location,
        description: item.description,
        image: item.image,
        isolationLevel: item.isolationLevel,
        hostId: item.hostId,
      },
    });
  };

  const searchResults = useMemo(
    () =>
      applyActiveFilters(
        allProperties.filter((item) => {
          if (!searchQuery.trim()) return false;
          const query = searchQuery.toLowerCase().trim();
          return (
            item.title?.toLowerCase().includes(query) ||
            item.location?.toLowerCase().includes(query)
          );
        })
      ),
    [allProperties, searchQuery, selectedPriceRange, selectedIsolation]
  );

  const exploreAllResults = useMemo(
    () => applyActiveFilters(allProperties.filter((item) => item.category === selectedCategory)),
    [allProperties, selectedCategory, selectedPriceRange, selectedIsolation]
  );

  const renderSection = (title: string, subCategoryName: string) => {
    const filtered = applyActiveFilters(
      allProperties.filter(
        (item) => item.category === selectedCategory && item.subCategory === subCategoryName
      )
    );
    if (filtered.length === 0) return null;
    return (
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {filtered.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={{ width: 300, marginRight: 15 }}
              activeOpacity={0.9}
              onPress={() => navigateToDetails(item)}
            >
              <PropertyCard {...item} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SearchHeader
        inputRef={inputRef}
        isSearching={isSearching}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        onFocusSearch={() => setIsSearching(true)}
        onCancelSearch={cancelSearch}
        onClearSearchQuery={() => setSearchQuery('')}
        activeFiltersCount={activeFiltersCount}
        onOpenFilterModal={openFilterModal}
        selectedPriceRange={selectedPriceRange}
        onClearPriceRange={() => setSelectedPriceRange(PRICE_RANGES[0])}
        selectedIsolation={selectedIsolation}
        onClearIsolation={() => setSelectedIsolation(ISOLATION_OPTIONS[0])}
        selectedCategory={selectedCategory}
        onSelectCategory={selectCategory}
      />

      {isSearching ? (
        <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
          {searchQuery.trim().length === 0 ? (
            <View style={styles.searchHint}>
              <Text style={styles.searchHintText}>
                Digite o nome de uma cabana, cidade ou região para buscar.
              </Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={styles.searchHint}>
              <Text style={styles.searchHintText}>
                Nenhum resultado encontrado para "{searchQuery}".
              </Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResults}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.9} onPress={() => navigateToDetails(item)}>
                  <PropertyCard {...item} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : isExploreAll ? (
        <View style={{ flex: 1 }}>
          <View style={styles.exploreAllHeader}>
            <TouchableOpacity onPress={() => setIsExploreAll(false)} style={styles.exploreBackBtn}>
              <ChevronUp size={18} color="#2D5A27" />
              <Text style={styles.exploreBackText}>Voltar</Text>
            </TouchableOpacity>
            <Text style={styles.exploreAllTitle}>
              {selectedCategory} · {exploreAllResults.length} opções
            </Text>
          </View>
          {exploreAllResults.length === 0 ? (
            <View style={styles.searchHint}>
              <Text style={styles.searchHintText}>
                Nenhuma cabana encontrada com os filtros aplicados.
              </Text>
            </View>
          ) : (
            <FlatList
              data={exploreAllResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResults}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.9} onPress={() => navigateToDetails(item)}>
                  <PropertyCard {...item} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : loadingProperties ? (
        <View style={styles.searchHint}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : allProperties.length === 0 ? (
        <View style={styles.searchHint}>
          <Text style={styles.searchHintText}>Nenhuma cabana disponível no momento.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {SECTIONS[selectedCategory]?.map(({ title, subCategory }) => (
            <View key={title}>
              {renderSection(title, subCategory)}
            </View>
          ))}
          <TouchableOpacity style={styles.seeAllButton} onPress={() => setIsExploreAll(true)}>
            <Text style={styles.seeAllText}>Explorar todas as opções</Text>
            <ChevronDown size={16} color="#374151" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </ScrollView>
      )}

      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        tempPriceRange={tempPriceRange}
        onChangePriceRange={setTempPriceRange}
        tempIsolation={tempIsolation}
        onChangeIsolation={setTempIsolation}
        onClear={clearFilters}
        onApply={applyFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { paddingBottom: 30 },
  sectionContainer: { marginTop: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 20, marginBottom: 15, color: '#1F2937' },
  horizontalScroll: { paddingLeft: 20, paddingRight: 20 },
  seeAllButton: {
    margin: 20, marginTop: 40, padding: 15, borderRadius: 12, borderWidth: 1,
    borderColor: '#E5E7EB', alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  seeAllText: { fontWeight: '600', color: '#374151' },
  searchResults: { padding: 20, paddingBottom: 100 },
  searchHint: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  searchHintText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
  exploreAllHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12,
  },
  exploreBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exploreBackText: { fontSize: 14, color: '#2D5A27', fontWeight: '600' },
  exploreAllTitle: { fontSize: 15, fontWeight: 'bold', color: '#1F2937' },
});
