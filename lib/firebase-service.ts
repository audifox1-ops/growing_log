import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  getDocs
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { db, storage } from "./firebase";

// --- Interfaces ---

export interface Child {
  id?: string;
  name: string;
  birthDate: string;
  profileImageUrl?: string;
  createdAt: number;
}

export interface Photo {
  id?: string;
  childIds: string[];
  imageUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  takenAt: number;
  ageInMonths: number;
  category: string;
  caption?: string;
  createdAt: number;
}

export interface VideoProject {
  id?: string;
  childId: string;
  title: string;
  scenes: {
    photoId: string;
    duration: number;
    caption: string;
  }[];
  musicId?: string;
  templateId?: string;
  status: 'draft' | 'completed';
  createdAt: number;
  updatedAt: number;
}

// --- Helper Functions for Sub-collections ---

/**
 * Gets a reference to a sub-collection under a specific user.
 * Structure: users/{userId}/{collectionName}
 */
const getSubCol = (userId: string, colName: string) => {
  if (!db) return null;
  return collection(db, "users", userId, colName);
};

// --- Firebase Service Content ---

export const firebaseService = {
  // --- Children (users/{userId}/children) ---
  
  async addChild(userId: string, child: Omit<Child, 'id' | 'createdAt'>) {
    const col = getSubCol(userId, "children");
    if (!col) throw new Error("Firebase not initialized");
    return await addDoc(col, {
      ...child,
      createdAt: Date.now()
    });
  },

  async deleteChild(userId: string, id: string) {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, "users", userId, "children", id));
  },

  // --- Photos (users/{userId}/photos) & Storage (images/{userId}/...) ---
  
  async uploadPhoto(userId: string, file: Blob, metadata: Omit<Photo, 'id' | 'imageUrl' | 'storagePath' | 'createdAt'>) {
    if (!storage || !db) throw new Error("Firebase not initialized");
    
    // storagePath: images/{userId}/{timestamp}_{filename}
    const timestamp = Date.now();
    const storagePath = `images/${userId}/${timestamp}_${metadata.fileName}`;
    const fileRef = ref(storage, storagePath);

    // 1. Upload to Firebase Storage
    await uploadBytes(fileRef, file);
    const imageUrl = await getDownloadURL(fileRef);

    // 2. Save Metadata to Firestore Sub-collection
    const col = getSubCol(userId, "photos");
    if (!col) throw new Error("Firebase not initialized");
    
    const docRef = await addDoc(col, {
      ...metadata,
      imageUrl,
      storagePath,
      createdAt: Date.now()
    });
    
    console.log(`Photo metadata saved to users/${userId}/photos with ID: ${docRef.id}`);
    return docRef;
  },

  async deletePhoto(userId: string, photoId: string, storagePath: string) {
    if (!storage || !db) throw new Error("Firebase not initialized");
    
    // 1. Delete from Cloud Storage
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef).catch(console.error);

    // 2. Delete from Firestore Sub-collection
    await deleteDoc(doc(db, "users", userId, "photos", photoId));
  },

  async updatePhoto(userId: string, photoId: string, data: Partial<Photo>) {
    if (!db) throw new Error("Firebase not initialized");
    const photoDoc = doc(db, "users", userId, "photos", photoId);
    await updateDoc(photoDoc, data);
  },

  // --- Video Projects (users/{userId}/videoProjects) ---
  
  async saveVideoProject(userId: string, project: Omit<VideoProject, 'id' | 'updatedAt' | 'createdAt'>) {
    const col = getSubCol(userId, "videoProjects");
    if (!col) throw new Error("Firebase not initialized");
    return await addDoc(col, {
      ...project,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  },

  async updateVideoProject(userId: string, projectId: string, data: Partial<VideoProject>) {
    if (!db) throw new Error("Firebase not initialized");
    const projectDoc = doc(db, "users", userId, "videoProjects", projectId);
    await updateDoc(projectDoc, {
      ...data,
      updatedAt: Date.now()
    });
  },

  async deleteVideoProject(userId: string, projectId: string) {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, "users", userId, "videoProjects", projectId));
  },

  // --- Real-time Subscriptions (Implicitly filtered by Sub-collection path) ---
  
  subscribeChildren(userId: string, callback: (data: Child[]) => void) {
    const col = getSubCol(userId, "children");
    if (!col) return () => {};
    
    const q = query(col, orderBy("createdAt", "desc"));
    
    return onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Child));
        callback(data);
      },
      (error) => {
        console.error(`Children Subscription Error for users/${userId}:`, error);
      }
    );
  },

  subscribePhotos(userId: string, childId: string, callback: (data: Photo[]) => void) {
    const col = getSubCol(userId, "photos");
    if (!col) return () => {};
    
    // Use array-contains for 'childIds' array field
    const q = query(
      col, 
      where("childIds", "array-contains", childId),
      orderBy("takenAt", "desc")
    );
    
    return onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
        callback(data);
      },
      (error) => {
        console.error(`Photos Subscription Error for users/${userId}/photos:`, error);
      }
    );
  },

  subscribeVideoProjects(userId: string, childId: string, callback: (data: VideoProject[]) => void) {
    const col = getSubCol(userId, "videoProjects");
    if (!col) return () => {};
    
    const q = query(
      col,
      where("childId", "==", childId),
      orderBy("updatedAt", "desc")
    );
    
    return onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VideoProject));
        callback(data);
      },
      (error) => {
        console.error(`VideoProjects Subscription Error for users/${userId}/videoProjects:`, error);
      }
    );
  }
};
