import Dexie, { type Table } from 'dexie';

/**
 * Child Entity: Represents a child profile.
 */
export interface Child {
  id?: number;
  name: string;
  birthDate: string; // ISO string (YYYY-MM-DD)
  profileImage?: Blob;
  createdAt: number;
}

/**
 * Photo Entity: Represents a photo belonging to a child.
 */
export interface Photo {
  id?: number;
  childId: number; // Foreign key to Child.id
  blob: Blob;
  fileName: string;
  fileSize: number;
  mimeType: string;
  takenAt: number; // Timestamp
  ageInMonths: number;
  category: string; // e.g., "영아기", "유아기"
  caption?: string;
  createdAt: number;
}

/**
 * VideoProject Entity: Represents a video project created for a child.
 */
export interface VideoProject {
  id?: number;
  childId: number; // Foreign key to Child.id
  title: string;
  scenes: {
    photoId: number;
    duration: number; // seconds
    caption: string;
  }[];
  musicId?: string;
  status: 'draft' | 'completed';
  createdAt: number;
  updatedAt: number;
}

/**
 * AppDatabase: Dexie database configuration.
 */
export class AppDatabase extends Dexie {
  children!: Table<Child>;
  photos!: Table<Photo>;
  videoProjects!: Table<VideoProject>;

  constructor() {
    super('TreasureBoxDB');
    
    // Define tables and indexes
    // ++id: Auto-incrementing primary key
    // childId: Indexed for fast filtering by child
    this.version(1).stores({
      children: '++id, name, birthDate',
      photos: '++id, childId, takenAt, category',
      videoProjects: '++id, childId, status'
    });
  }
}

// Export a singleton instance of the database
export const db = new AppDatabase();
