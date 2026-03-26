import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * ChildStore: Manages the active child's state.
 * Uses persistence to remember the selected child across page reloads.
 */
interface ChildStore {
  activeChildId: number | null;
  setActiveChildId: (id: number | null) => void;
}

export const useChildStore = create<ChildStore>()(
  persist(
    (set) => ({
      activeChildId: null,
      setActiveChildId: (id) => set({ activeChildId: id }),
    }),
    {
      name: 'active-child-storage', // Key for localStorage
    }
  )
);
