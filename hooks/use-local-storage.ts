'use client';

import { useState, useEffect } from 'react';

export interface ChildProfile {
  name: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
}

export interface PhotoEntry {
  id: string;
  url: string;
  date: string;
  category: string;
}

export function useLocalStorage() {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedProfile = localStorage.getItem('child_profile');
    const savedPhotos = localStorage.getItem('child_photos');

    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(parsed);
    }
    if (savedPhotos) {
      const parsed = JSON.parse(savedPhotos);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotos(parsed);
    }
    
    setIsInitialized(true);
  }, []);

  const saveProfile = (newProfile: ChildProfile) => {
    setProfile(newProfile);
    localStorage.setItem('child_profile', JSON.stringify(newProfile));
  };

  const addPhoto = (photo: PhotoEntry) => {
    const updated = [photo, ...photos];
    setPhotos(updated);
    localStorage.setItem('child_photos', JSON.stringify(updated));
  };

  const deletePhoto = (id: string) => {
    const updated = photos.filter(p => p.id !== id);
    setPhotos(updated);
    localStorage.setItem('child_photos', JSON.stringify(updated));
  };

  const clearAll = () => {
    localStorage.clear();
    setProfile(null);
    setPhotos([]);
  };

  return {
    profile,
    photos,
    isInitialized,
    saveProfile,
    addPhoto,
    deletePhoto,
    clearAll
  };
}
