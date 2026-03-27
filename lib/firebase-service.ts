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
  Timestamp,
  getDocs
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { db, storage } from "./firebase";

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

// Helper to get collection refs safely (Lazy Loading to prevent build-time crashes)
const getCol = (name: string) => {
  if (!db) return null;
  return collection(db, name);
};

export const firebaseService = {
  // --- Children ---
  async addChild(child: Omit<Child, 'id'>) {
    const col = getCol("children");
    if (!col) throw new Error("Firebase not initialized");
    return await addDoc(col, {
      ...child,
      createdAt: Date.now()
    });
  },

  async deleteChild(id: string) {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, "children", id));
  },

  // --- Photos & Storage ---
  async uploadPhoto(file: Blob, metadata: Omit<Photo, 'id' | 'imageUrl' | 'storagePath'>) {
    if (!storage || !db) throw new Error("Firebase not initialized");
    
    const filename = `${Date.now()}_${metadata.fileName}`;
    const storagePath = `photos/${metadata.childIds[0]}/${filename}`;
    const fileRef = ref(storage, storagePath);

    // 1. Upload to Storage
    await uploadBytes(fileRef, file);
    const imageUrl = await getDownloadURL(fileRef);

    // 2. Save Metadata to Firestore
    const col = getCol("photos");
    if (!col) throw new Error("Firebase not initialized");
    const docRef = await addDoc(col, {
      ...metadata,
      imageUrl,
      storagePath,
      createdAt: Date.now()
    });
    console.log(`Photo metadata saved to Firestore with ID: ${docRef.id}`);
    return docRef;
  },

  async deletePhoto(photoId: string, storagePath: string) {
    if (!storage || !db) throw new Error("Firebase not initialized");
    
    // 1. Delete from Storage
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef).catch(console.error);

    // 2. Delete from Firestore
    await deleteDoc(doc(db, "photos", photoId));
  },

  async updatePhoto(photoId: string, data: Partial<Photo>) {
    if (!db) throw new Error("Firebase not initialized");
    const photoDoc = doc(db, "photos", photoId);
    await updateDoc(photoDoc, data);
  },

  // --- Video Projects ---
  async saveVideoProject(project: Omit<VideoProject, 'id'>) {
    const col = getCol("videoProjects");
    if (!col) throw new Error("Firebase not initialized");
    return await addDoc(col, {
      ...project,
      updatedAt: Date.now()
    });
  },

  async updateVideoProject(projectId: string, data: Partial<VideoProject>) {
    if (!db) throw new Error("Firebase not initialized");
    const projectDoc = doc(db, "videoProjects", projectId);
    await updateDoc(projectDoc, {
      ...data,
      updatedAt: Date.now()
    });
  },

  async deleteVideoProject(projectId: string) {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, "videoProjects", projectId));
  },

  // --- Real-time Subscriptions ---
  subscribeChildren(callback: (data: Child[]) => void) {
    const col = getCol("children");
    if (!col) return () => {}; // No-op during build/server-side
    
    const q = query(col, orderBy("createdAt", "desc"));
    return onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Child));
        callback(data);
      },
      (error) => {
        console.error("Children Subscription Error:", error);
      }
    );
  },

  subscribePhotos(childId: string, callback: (data: Photo[]) => void) {
    const col = getCol("photos");
    if (!col) return () => {};
    
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
        console.error("Photos Subscription Error (Missing Index or Permission):", error);
      }
    );
  },

  subscribeVideoProjects(childId: string, callback: (data: VideoProject[]) => void) {
    const col = getCol("videoProjects");
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
        console.error("VideoProjects Subscription Error:", error);
      }
    );
  }
};
