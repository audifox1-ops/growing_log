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

// Collections Refs
const childrenRef = collection(db, "children");
const photosRef = collection(db, "photos");
const projectsRef = collection(db, "videoProjects");

export const firebaseService = {
  // ... (existing addChild, deleteChild)
  async addChild(child: Omit<Child, 'id'>) {
    return await addDoc(childrenRef, {
      ...child,
      createdAt: Date.now()
    });
  },

  async deleteChild(id: string) {
    await deleteDoc(doc(db, "children", id));
  },

  // --- Photos & Storage ---
  async uploadPhoto(file: Blob, metadata: Omit<Photo, 'id' | 'imageUrl' | 'storagePath'>) {
    const filename = `${Date.now()}_${metadata.fileName}`;
    const storagePath = `photos/${metadata.childIds[0]}/${filename}`;
    const fileRef = ref(storage, storagePath);

    // 1. Upload to Storage
    await uploadBytes(fileRef, file);
    const imageUrl = await getDownloadURL(fileRef);

    // 2. Save Metadata to Firestore
    return await addDoc(photosRef, {
      ...metadata,
      imageUrl,
      storagePath,
      createdAt: Date.now()
    });
  },

  async deletePhoto(photoId: string, storagePath: string) {
    // 1. Delete from Storage
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef).catch(console.error);

    // 2. Delete from Firestore
    await deleteDoc(doc(db, "photos", photoId));
  },

  async updatePhoto(photoId: string, data: Partial<Photo>) {
    const photoDoc = doc(db, "photos", photoId);
    await updateDoc(photoDoc, data);
  },

  // --- Video Projects ---
  async saveVideoProject(project: Omit<VideoProject, 'id'>) {
    return await addDoc(projectsRef, {
      ...project,
      updatedAt: Date.now()
    });
  },

  async updateVideoProject(projectId: string, data: Partial<VideoProject>) {
    const projectDoc = doc(db, "videoProjects", projectId);
    await updateDoc(projectDoc, {
      ...data,
      updatedAt: Date.now()
    });
  },

  async deleteVideoProject(projectId: string) {
    await deleteDoc(doc(db, "videoProjects", projectId));
  },

  // --- Real-time Subscriptions ---
  subscribeChildren(callback: (data: Child[]) => void) {
    const q = query(childrenRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Child));
      callback(data);
    });
  },

  subscribePhotos(childId: string, callback: (data: Photo[]) => void) {
    const q = query(
      photosRef, 
      where("childIds", "array-contains", childId),
      orderBy("takenAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      callback(data);
    });
  },

  subscribeVideoProjects(childId: string, callback: (data: VideoProject[]) => void) {
    const q = query(
      projectsRef,
      where("childId", "==", childId),
      orderBy("updatedAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VideoProject));
      callback(data);
    });
  }
};
