import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlignLeft, Camera, ChevronLeft, DollarSign, Home, MapPin } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useListings } from '../context/ListingContext';
import { createProperty, updateProperty, uploadPropertyImage, UpdatableProperty } from '../services/propertyService';
import type { IsolationLevel } from '../services/types';

const CATEGORIES = [
  { id: 'Praia Privativa', emoji: '🏖️', label: 'Praia Privativa' },
  { id: 'Campo',           emoji: '🌲', label: 'Campo'           },
  { id: 'Cachoeira',       emoji: '💦', label: 'Cachoeira'       },
];

const SUB_CATEGORIES: Record<string, { id: string; label: string }[]> = {
  'Praia Privativa': [
    { id: 'Populares', label: '🔥 Populares' },
    { id: 'Nordeste',  label: '☀️ Nordeste'  },
    { id: 'Sul',       label: '🌊 Sul'        },
  ],
  'Campo': [
    { id: 'Populares', label: '🔥 Populares' },
    { id: 'Montanhas', label: '🏔️ Montanhas' },
    { id: 'Planícies', label: '🌾 Planícies'  },
  ],
  'Cachoeira': [
    { id: 'Populares',    label: '🔥 Populares'    },
    { id: 'Centro-Oeste', label: '🌿 Centro-Oeste' },
    { id: 'Sudeste',      label: '💦 Sudeste'      },
  ],
};

const ISOLATION_LEVELS = [
  { id: 'urbano',  emoji: '🏘️', label: 'Vizinhos próximos',  description: 'Área residencial ou vila, vizinhos a menos de 500m.' },
  { id: 'semi',    emoji: '🌲', label: 'Alguma privacidade',  description: 'Área rural tranquila, vizinhos a mais de 1km.'       },
  { id: 'isolado', emoji: '🏕️', label: 'Bem isolado',         description: 'Vizinho mais próximo a mais de 3km. Silêncio total.' },
  { id: 'extremo', emoji: '🌄', label: 'Isolamento total',    description: 'Acesso restrito. Natureza selvagem ao redor.'        },
];

export default function CreateListingScreen() {
  const router = useRouter();
  const { addListing, updateListing } = useListings();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const [saving, setSaving] = useState(false);

  // Modo edição: my-cabins.tsx navega pra cá com editId + os dados atuais
  // da cabana nos params, em vez de reservar uma tela separada só pra isso.
  const editId = typeof params.editId === 'string' ? params.editId : undefined;
  const editIsRemote = params.editIsRemote === '1';
  const isEditMode = !!editId;

  const [title, setTitle] = useState(isEditMode ? String(params.title ?? '') : '');
  const [location, setLocation] = useState(isEditMode ? String(params.location ?? '') : '');
  const [price, setPrice] = useState(isEditMode ? String(params.price ?? '') : '');
  const [description, setDescription] = useState(isEditMode ? String(params.description ?? '') : '');
  const [imageUri, setImageUri] = useState<string | null>(isEditMode ? (String(params.image ?? '') || null) : null);
  const [isolationLevel, setIsolationLevel] = useState<string | null>(
    isEditMode ? (String(params.isolationLevel ?? '') || null) : null
  );
  const [category, setCategory] = useState<string | null>(isEditMode ? (String(params.category ?? '') || null) : null);
  const [subCategory, setSubCategory] = useState<string | null>(
    isEditMode ? (String(params.subCategory ?? '') || null) : null
  );

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  // Usuário estático (__DEV__) não existe em profiles/auth - continua salvando
  // só localmente (ListingContext), como sempre funcionou.
  const saveLocally = () => {
    const dados = {
      title: title.trim(),
      location: location.trim(),
      price: parseFloat(price) || 0,
      description: description.trim(),
      imageUri,
      isolationLevel,
      // saveLocally só é chamada depois dos guards de title/category em
      // handleSave, mas o TS não carrega essa narrowing pra uma função
      // separada - '' nunca acontece na prática.
      category: category ?? '',
      subCategory: subCategory || 'Populares',
    };
    if (isEditMode && editId) {
      updateListing(editId, dados);
    } else {
      addListing(dados);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o título do anúncio.');
      return;
    }
    if (!category) {
      Alert.alert('Campo obrigatório', 'Selecione uma categoria.');
      return;
    }

    const isStaticUser = !!user?.id && user.id.startsWith('static-');

    // Edição de cabana local (não veio do banco) - mesmo fluxo local de sempre.
    if (isEditMode && !editIsRemote) {
      saveLocally();
      Alert.alert('Anúncio atualizado! 🌿', 'As alterações já estão visíveis.', [
        { text: 'Ver minhas cabanas', onPress: () => router.replace('/my-cabins') },
      ]);
      return;
    }

    if (!user || isStaticUser) {
      saveLocally();
      Alert.alert(
        isEditMode ? 'Anúncio atualizado! 🌿' : 'Anúncio publicado! 🌿',
        isEditMode ? 'As alterações já estão visíveis.' : 'Sua cabana já está visível no explorar.',
        [
          { text: 'Ver minhas cabanas', onPress: () => router.replace('/my-cabins') },
          ...(isEditMode ? [] : [{ text: 'OK', onPress: () => router.back() }]),
        ]
      );
      return;
    }

    setSaving(true);

    // Só sobe uma imagem nova se o usuário trocou a foto - expo-image-picker
    // sempre devolve um file:// local; a URL prefill do modo edição é http(s).
    let imageUrl: string | null = null;
    const pickedNewImage = !!imageUri && !imageUri.startsWith('http');
    if (pickedNewImage) {
      const { data: uploadedUrl, error: uploadError } = await uploadPropertyImage(imageUri!, user.id);
      if (uploadError) {
        console.log('[create-listing] upload de imagem falhou ->', uploadError);
        // segue sem trocar a imagem em vez de travar o anúncio inteiro por causa da foto
      } else {
        imageUrl = uploadedUrl;
      }
    }

    if (isEditMode && editId) {
      const dados: UpdatableProperty = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        price: parseFloat(price) || 0,
        isolation_level: (isolationLevel as IsolationLevel | null) ?? null,
        category,
        sub_category: subCategory || 'Populares',
      };
      if (pickedNewImage && imageUrl) dados.images = [imageUrl];

      const { error } = await updateProperty(editId, dados);
      setSaving(false);

      if (error) {
        Alert.alert('Erro ao atualizar', 'Não foi possível salvar as alterações agora. Tente novamente.');
        return;
      }

      Alert.alert('Anúncio atualizado! 🌿', 'As alterações já estão visíveis.', [
        { text: 'Ver minhas cabanas', onPress: () => router.replace('/my-cabins') },
      ]);
      return;
    }

    const { data: property, error } = await createProperty({
      owner_id: user.id,
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      price: parseFloat(price) || 0,
      isolation_level: (isolationLevel as IsolationLevel | null) ?? null,
      category,
      sub_category: subCategory || 'Populares',
      images: imageUrl ? [imageUrl] : [],
      amenities: [],
      // status omitido de propósito - o banco usa o default 'pendente'
      // (properties.status NOT NULL DEFAULT 'pendente', schema.sql).
    });

    setSaving(false);

    if (error || !property) {
      console.log('[create-listing] createProperty falhou, salvando local ->', error);
      saveLocally();
      Alert.alert(
        'Salvo só neste aparelho',
        'Não foi possível publicar no servidor agora, mas o anúncio já aparece no seu painel.',
        [{ text: 'Ver minhas cabanas', onPress: () => router.replace('/my-cabins') }]
      );
      return;
    }

    Alert.alert(
      'Anúncio enviado! 🌿',
      'Sua cabana foi enviada para aprovação e vai aparecer no explorar assim que for revisada.',
      [
        { text: 'Ver minhas cabanas', onPress: () => router.replace('/my-cabins') },
        { text: 'OK', onPress: () => router.back() },
      ]
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Editar Cabana' : 'Nova Cabana'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Foto */}
        <TouchableOpacity style={styles.photoUploadArea} activeOpacity={0.7} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
          ) : (
            <>
              <Camera size={32} color="#9CA3AF" />
              <Text style={styles.photoUploadText}>Adicionar Foto Principal</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Título */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Título do Anúncio</Text>
          <View style={styles.inputWrapper}>
            <Home size={20} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Ex: Refúgio das Araucárias" value={title} onChangeText={setTitle} />
          </View>
        </View>

        {/* Localização */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Localização</Text>
          <View style={styles.inputWrapper}>
            <MapPin size={20} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Cidade e Estado" value={location} onChangeText={setLocation} />
          </View>
        </View>

        {/* Preço */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Valor por Noite (R$)</Text>
          <View style={styles.inputWrapper}>
            <DollarSign size={20} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="0,00" keyboardType="numeric" value={price} onChangeText={setPrice} />
          </View>
        </View>

        {/* Descrição */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Descrição do Espaço</Text>
          <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
            <AlignLeft size={20} color="#9CA3AF" style={styles.textAreaIcon} />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Fale um pouco sobre o que torna sua cabana especial..."
              multiline numberOfLines={5} textAlignVertical="top"
              value={description} onChangeText={setDescription}
            />
          </View>
        </View>

        {/* Categoria */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Categoria</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryCard, isSelected && styles.categoryCardActive]}
                  onPress={() => { setCategory(cat.id); setSubCategory(null); }}
                >
                  <Text style={{ fontSize: 24 }}>{cat.emoji}</Text>
                  <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Subcategoria */}
        {category && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Seção</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {SUB_CATEGORIES[category].map((sub) => {
                const isSelected = subCategory === sub.id;
                return (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setSubCategory(sub.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {sub.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Isolamento */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nível de Isolamento</Text>
          <Text style={styles.labelSub}>Ajuda hóspedes a entender o quanto sua cabana é remota.</Text>
          <View style={styles.isolationGrid}>
            {ISOLATION_LEVELS.map((level) => {
              const isSelected = isolationLevel === level.id;
              return (
                <TouchableOpacity
                  key={level.id}
                  style={[styles.isolationCard, isSelected && styles.isolationCardActive]}
                  onPress={() => setIsolationLevel(level.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.isolationEmoji}>{level.emoji}</Text>
                  <Text style={[styles.isolationLabel, isSelected && styles.isolationLabelActive]}>
                    {level.label}
                  </Text>
                  <Text style={[styles.isolationDesc, isSelected && styles.isolationDescActive]}>
                    {level.description}
                  </Text>
                  {isSelected && (
                    <View style={styles.isolationCheckBadge}>
                      <Text style={styles.isolationCheckText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{isEditMode ? 'Salvar Alterações' : 'Publicar Anúncio'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  photoUploadArea: {
    height: 180, backgroundColor: '#F9FAFB', borderRadius: 16,
    borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', marginBottom: 25, overflow: 'hidden',
  },
  photoUploadText: { color: '#6B7280', marginTop: 10, fontWeight: '500' },
  uploadedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  labelSub: { fontSize: 12, color: '#9CA3AF', marginBottom: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1F2937' },
  textAreaWrapper: { alignItems: 'flex-start', paddingTop: 14 },
  textAreaIcon: { marginRight: 10, marginTop: 2 },
  textArea: { height: 120, paddingTop: 0 },
  categoryCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  categoryCardActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  categoryLabel: { fontSize: 11, color: '#4B5563', fontWeight: '500', marginTop: 6, textAlign: 'center' },
  categoryLabelActive: { color: '#2D5A27', fontWeight: '700' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  chipActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  chipText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  chipTextActive: { color: '#2D5A27', fontWeight: '700' },
  footer: {
    padding: 20, paddingBottom: 35, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  saveButton: { backgroundColor: '#2D5A27', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  isolationGrid: { gap: 12 },
  isolationCard: {
    padding: 16, borderRadius: 14, borderWidth: 1.5,
    borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', position: 'relative',
  },
  isolationCardActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  isolationEmoji: { fontSize: 24, marginBottom: 6 },
  isolationLabel: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 3 },
  isolationLabelActive: { color: '#2D5A27' },
  isolationDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  isolationDescActive: { color: '#374151' },
  isolationCheckBadge: {
    position: 'absolute', top: 14, right: 14,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2D5A27', alignItems: 'center', justifyContent: 'center',
  },
  isolationCheckText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});