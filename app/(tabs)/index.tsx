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
import { SkeletonCardList } from '../../components/Skeleton';
import { PropertyCard } from '../../components/PropertyCard';
import { FilterModal } from '../../components/explorer/FilterModal';
import { SearchHeader } from '../../components/explorer/SearchHeader';
import { ISOLATION_OPTIONS, IsolationOption, PRICE_RANGES, PriceRange, SECTIONS } from '../../components/explorer/exploreConstants';
import { mapPropertyToListing } from '../../components/explorer/mapPropertyToListing';
import { useAuth } from '../../context/AuthContext';
import { Listing, useListings } from '../../context/ListingContext';
import { getProperties } from '../../services/propertyService';
import { availablePropertyIds } from '../../services/availabilityService';
import { DateRangePicker } from '../../components/DateRangePicker';
import type { Range } from '../../lib/dateRange';
import { formatBR } from '../../lib/dateRange';
import { filterByAmenities, searchProperties, toggleAmenity } from '../../lib/search';

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
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
            console.log('[index] getProperties falhou ->', error);
            if (!hasLoadedOnceRef.current) setRemoteProperties(null);
            setLoadError(true);
          } else {
            setLoadError(false);
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
    }, [isStaticUser, reloadKey])
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

  // Comodidades e disponibilidade por data (migração 021).
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [tempAmenities, setTempAmenities] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<Range | null>(null);
  const [tempDates, setTempDates] = useState<Range | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [availableIds, setAvailableIds] = useState<Set<string> | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const activeFiltersCount = [
    selectedPriceRange.id !== 'todos',
    selectedIsolation.id !== 'todos',
    selectedAmenities.length > 0,
    !!selectedDates,
  ].filter(Boolean).length;

  // Com um período escolhido, pergunta ao banco quais cabanas estão livres (sem reserva e sem
  // bloqueio do anfitrião). Se a pergunta falhar, a lista não é filtrada e a tela avisa.
  useEffect(() => {
    if (!selectedDates) {
      setAvailableIds(null);
      setAvailabilityError(null);
      return;
    }
    let cancelled = false;
    availablePropertyIds(selectedDates.start, selectedDates.end).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setAvailableIds(null);
        setAvailabilityError(error ?? 'Não foi possível buscar por data agora.');
      } else {
        setAvailableIds(new Set(data));
        setAvailabilityError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDates, reloadKey]);

  // useFocusEffect (não useEffect): a aba Explorar continua montada por baixo
  // quando outra tela (ex.: detalhes) é aberta por cima. Com useEffect, o botão
  // "voltar" do Android ainda caía neste handler e cancelava a busca escondida
  // em vez de fechar a tela que o usuário estava vendo.
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isSearching) { cancelSearch(); return true; }
        if (isExploreAll) { setIsExploreAll(false); return true; }
        return false;
      });
      return () => backHandler.remove();
    }, [isSearching, isExploreAll])
  );

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
    setTempAmenities(selectedAmenities);
    setTempDates(selectedDates);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setSelectedPriceRange(tempPriceRange);
    setSelectedIsolation(tempIsolation);
    setSelectedAmenities(tempAmenities);
    setSelectedDates(tempDates);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setTempPriceRange(PRICE_RANGES[0]);
    setTempIsolation(ISOLATION_OPTIONS[0]);
    setTempAmenities([]);
    setTempDates(null);
  };

  const applyActiveFilters = (list: Property[]) =>
    filterByAmenities(
      list.filter((item) => {
        const passPrice = item.price >= selectedPriceRange.min && item.price <= selectedPriceRange.max;
        const passIsolation =
          selectedIsolation.id === 'todos' ||
          (item.isolationLevel ?? '').toLowerCase() === selectedIsolation.id.toLowerCase();
        const passDates = !availableIds || availableIds.has(item.id);
        return passPrice && passIsolation && passDates;
      }),
      selectedAmenities
    );

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

  // Busca sem acento e com várias palavras (lib/search.ts); o resultado vem do mais relevante ao menos.
  const searchResults = useMemo(
    () => applyActiveFilters(searchProperties(allProperties, searchQuery)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allProperties, searchQuery, selectedPriceRange, selectedIsolation, selectedAmenities, availableIds]
  );

  const exploreAllResults = useMemo(
    () => applyActiveFilters(allProperties.filter((item) => item.category === selectedCategory)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allProperties, selectedCategory, selectedPriceRange, selectedIsolation, selectedAmenities, availableIds]
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

      {(selectedDates || selectedAmenities.length > 0) && (
        <View style={styles.activeBar} testID="active-filters-bar">
          <Text style={styles.activeBarText} numberOfLines={2}>
            {selectedDates ? `Livres de ${formatBR(selectedDates.start)} a ${formatBR(selectedDates.end)}` : ''}
            {selectedDates && selectedAmenities.length > 0 ? ' · ' : ''}
            {selectedAmenities.length > 0 ? selectedAmenities.join(', ') : ''}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setSelectedDates(null);
              setSelectedAmenities([]);
            }}
            accessibilityRole="button"
            accessibilityLabel="Remover filtros de data e comodidades"
            hitSlop={8}
          >
            <Text style={styles.activeBarClear}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!selectedDates && !!availabilityError && (
        <Text style={styles.availabilityError}>{availabilityError}</Text>
      )}

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
        <SkeletonCardList count={3} testID="explore-loading" />
      ) : allProperties.length === 0 ? (
        <View style={styles.searchHint}>
          <Text style={styles.searchHintText}>
            {loadError
              ? 'Não foi possível carregar as cabanas. Verifique sua conexão e tente novamente.'
              : 'Nenhuma cabana disponível no momento.'}
          </Text>
          {loadError && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => setReloadKey((k) => k + 1)}>
              <Text style={styles.retryBtnText}>Tentar de novo</Text>
            </TouchableOpacity>
          )}
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
        tempAmenities={tempAmenities}
        onToggleAmenity={(a) => setTempAmenities((cur) => toggleAmenity(cur, a))}
        tempDates={tempDates}
        onPickDates={() => {
          // Fecha os filtros enquanto o calendário está aberto (dois modais juntos pesam no Android).
          setFilterModalVisible(false);
          setDatePickerVisible(true);
        }}
        onClearDates={() => setTempDates(null)}
      />

      <DateRangePicker
        visible={datePickerVisible}
        title="Quando você quer ficar?"
        onClose={() => {
          setDatePickerVisible(false);
          setFilterModalVisible(true);
        }}
        onConfirm={(range) => {
          setTempDates(range);
          setDatePickerVisible(false);
          setFilterModalVisible(true);
        }}
        initial={tempDates ?? undefined}
        maxNights={60}
        confirmLabel="Usar este período"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  retryBtn: { marginTop: 20, backgroundColor: '#2D5A27', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontWeight: 'bold' },
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
  activeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#F0F7F0', paddingHorizontal: 20, paddingVertical: 10 },
  activeBarText: { flex: 1, color: '#2D5A27', fontSize: 13, fontWeight: '600' },
  activeBarClear: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  availabilityError: { color: '#B45309', backgroundColor: '#FFFBEB', fontSize: 12, paddingHorizontal: 20, paddingVertical: 8 },
  searchHintText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
  exploreAllHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12,
  },
  exploreBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exploreBackText: { fontSize: 14, color: '#2D5A27', fontWeight: '600' },
  exploreAllTitle: { fontSize: 15, fontWeight: 'bold', color: '#1F2937' },
});
