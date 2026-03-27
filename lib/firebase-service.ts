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
import { db } from "./firebase";

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

// --- Helper Functions ---

/**
 * 이미지를 리사이징하고 압축하여 Base64 문자열로 변환합니다.
 * Firestore 1MB 제한을 고려하여 품질과 해상도를 조절합니다.
 */
const compressImage = (file: Blob, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("Browser environment required for image compression"));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // 가로/세로 비율 유지하며 리사이징
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG 형식으로 압축 (용량 절감 효과가 큼)
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

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

  // --- Photos (users/{userId}/photos) - Base64 Firestore Storage ---
  
  async uploadPhoto(userId: string, file: Blob, metadata: Omit<Photo, 'id' | 'imageUrl' | 'createdAt'>) {
    if (!db) throw new Error("Firebase not initialized");
    
    // 1. 이미지 압축 및 Base64 변환 (Storage 대신 Firestore에 직접 저장)
    console.log(`--- [Debug] 이미지 압축 시작: ${metadata.fileName} ---`);
    const base64Image = await compressImage(file);
    console.log(`--- [Debug] 이미지 압축 완료 (Base64 길이: ${base64Image.length}) ---`);

    if (base64Image.length > 1000000) {
      throw new Error("이미지 용량이 너무 큽니다. (Firestore 1MB 제한 초과)");
    }

    // 2. Metadata와 Base64 데이터를 Firestore Sub-collection에 저장
    const col = getSubCol(userId, "photos");
    if (!col) throw new Error("Firebase not initialized");
    
    const docRef = await addDoc(col, {
      ...metadata,
      imageUrl: base64Image, // 이제 imageUrl이 Base64 데이터 자체입니다.
      createdAt: Date.now()
    });
    
    console.log(`Photo saved to Firestore (Base64) with ID: ${docRef.id}`);
    return docRef;
  },

  async deletePhoto(userId: string, photoId: string) {
    if (!db) throw new Error("Firebase not initialized");
    // Firestore에서만 삭제 (스토리지 삭제 로직 제거)
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

  // --- Real-time Subscriptions ---
  
  subscribeChildren(userId: string, callback: (data: Child[]) => void) {
    const col = getSubCol(userId, "children");
    if (!col) return () => {};
    
    const q = query(col, orderBy("createdAt", "desc"));
    
    return onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Child));
        callback(data);
      },
      (error: any) => {
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          console.warn("--- [Action Required] Firestore 색인 생성이 필요합니다. ---");
        }
        console.error(`Children Subscription Error:`, error);
      }
    );
  },

  subscribePhotos(userId: string, childId: string, callback: (data: Photo[]) => void) {
    const col = getSubCol(userId, "photos");
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
      (error: any) => {
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          console.warn("--- [Action Required] Firestore 색인 생성이 필요합니다. ---");
        }
        console.error(`Photos Subscription Error:`, error);
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
      (error: any) => {
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          console.warn("--- [Action Required] Firestore 색인 생성이 필요합니다. ---");
        }
        console.error(`VideoProjects Subscription Error:`, error);
      }
    );
  }
};
