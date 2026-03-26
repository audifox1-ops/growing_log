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
 * Photo Entity: Represents a photo belonging to one or more children.
 */
export interface Photo {
  id?: number;
  childIds: number[]; // Array of Foreign keys to Child.id (MultiEntry)
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
  templateId?: string;
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
    // *childIds: MultiEntry index for fast filtering by any child in the array
    this.version(2).stores({
      children: '++id, name, birthDate',
      photos: '++id, *childIds, takenAt, category',
      videoProjects: '++id, childId, status'
    });
  }
}

// Export a singleton instance of the database
export const db = new AppDatabase();
