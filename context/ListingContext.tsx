import React, { createContext, useCallback, useContext, useState } from 'react';

export interface Listing {
  id: string;
  title: string;
  location: string;
  price: number;
  description: string;
  imageUri?: string | null;
  image?: string | null;
  isolationLevel: string | null;
  createdAt: string;
  bookingsCount: number;
  rating: number;
  category?: string;
  subCategory?: string;
  hostId?: string;
}

interface ListingContextData {
  listings: Listing[];
  allProperties: Listing[];
  addListing: (l: Omit<Listing, 'id' | 'createdAt' | 'bookingsCount' | 'rating'>) => void;
  removeListing: (id: string) => void;
  updateListing: (id: string, data: Partial<Listing>) => void;
}

const ListingContext = createContext<ListingContextData>({
  listings: [],
  allProperties: [],
  addListing: () => {},
  removeListing: () => {},
  updateListing: () => {},
});

const INITIAL_PROPERTIES: Listing[] = [
  // ── PRAIA PRIVATIVA ──────────────────────────────────────────
  {
    id: 'p1',
    title: 'Vila dos Corais',
    location: 'São Miguel dos Milagres, AL',
    price: 880,
    description: 'Design moderno com piscinas naturais.',
    image: 'https://images.unsplash.com/photo-1537956965359-7573183d1f57?w=800&q=80',
    isolationLevel: 'extremo',
    createdAt: '10/01/2025',
    bookingsCount: 8,
    rating: 4.8,
    category: 'Praia Privativa',
    subCategory: 'Populares',
    hostId: 'static-anfitriao-01',
  },
  {
    id: 'p2',
    title: 'Casa de Vidro Oceânica',
    location: 'Ilhabela, SP',
    price: 950,
    description: 'Totalmente privativa com acesso ao mar.',
    image: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80',
    isolationLevel: 'extremo',
    createdAt: '05/02/2025',
    bookingsCount: 5,
    rating: 4.9,
    category: 'Praia Privativa',
    subCategory: 'Sul',
    hostId: 'static-anfitriao-01',
  },
  {
    id: 'p3',
    title: 'Bangalô Areia Branca',
    location: 'Trancoso, BA',
    price: 1200,
    description: 'Pé na areia com serviço exclusivo.',
    image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80',
    isolationLevel: 'extremo',
    createdAt: '20/01/2025',
    bookingsCount: 6,
    rating: 5.0,
    category: 'Praia Privativa',
    subCategory: 'Nordeste',
    hostId: 'static-anfitriao-01',
  },

  // ── CAMPO ────────────────────────────────────────────────────
  {
    id: 'c1',
    title: 'Cabana do Lago Azul',
    location: 'Campos do Jordão, SP',
    price: 450,
    description: 'Um refúgio tranquilo à beira do lago.',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    isolationLevel: 'isolado',
    createdAt: '03/02/2025',
    bookingsCount: 4,
    rating: 4.9,
    category: 'Campo',
    subCategory: 'Populares',
    hostId: 'static-anfitriao-01',
  },
  {
    id: 'c2',
    title: 'Refúgio da Montanha',
    location: 'Monte Verde, MG',
    price: 520,
    description: 'Luxo com som de queda d\'água.',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    isolationLevel: 'extremo',
    createdAt: '12/01/2025',
    bookingsCount: 7,
    rating: 5.0,
    category: 'Campo',
    subCategory: 'Montanhas',
    hostId: 'static-anfitriao-01',
  },
  {
    id: 'c3',
    title: 'Chalé Nascer do Sol',
    location: 'Urubici, SC',
    price: 380,
    description: 'Vista privilegiada da serra.',
    image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&q=80',
    isolationLevel: 'semi',
    createdAt: '08/03/2025',
    bookingsCount: 3,
    rating: 4.8,
    category: 'Campo',
    subCategory: 'Planícies',
    hostId: 'static-anfitriao-01',
  },
  {
    id: 'c4',
    title: 'A-Frame Forest House',
    location: 'Gramado, RS',
    price: 550,
    description: 'Cabana estilo A-frame com lareira.',
    image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&q=80',
    isolationLevel: 'isolado',
    createdAt: '15/02/2025',
    bookingsCount: 9,
    rating: 4.9,
    category: 'Campo',
    subCategory: 'Montanhas',
    hostId: 'static-anfitriao-01',
  },

  // ── CACHOEIRA ────────────────────────────────────────────────
  {
    id: 'w1',
    title: 'Eco-Cabana das Águas',
    location: 'Pirenópolis, GO',
    price: 420,
    description: 'Trilha privativa para cachoeira.',
    image: 'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=800&q=80',
    isolationLevel: 'extremo',
    createdAt: '22/01/2025',
    bookingsCount: 5,
    rating: 4.7,
    category: 'Cachoeira',
    subCategory: 'Centro-Oeste',
    hostId: 'static-anfitriao-01',
  },
];

export function ListingProvider({ children }: { children: React.ReactNode }) {
  const [listings, setListings] = useState<Listing[]>(INITIAL_PROPERTIES);

  const addListing = useCallback((l: Omit<Listing, 'id' | 'createdAt' | 'bookingsCount' | 'rating'>) => {
    const newListing: Listing = {
      ...l,
      id: String(Date.now()),
      image: l.imageUri || l.image || null,
      price: typeof l.price === 'string' ? parseFloat(l.price) || 0 : l.price,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      bookingsCount: 0,
      rating: 0,
    };
    setListings(prev => [newListing, ...prev]);
  }, []);

  const removeListing = useCallback((id: string) => {
    setListings(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateListing = useCallback((id: string, data: Partial<Listing>) => {
    setListings(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  }, []);

  return (
    <ListingContext.Provider value={{
      listings,
      allProperties: listings,
      addListing,
      removeListing,
      updateListing,
    }}>
      {children}
    </ListingContext.Provider>
  );
}

export const useListings = () => useContext(ListingContext);