'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Baby, Plus, Trash2, Users, ChevronRight, X, Camera, Loader2, AlertCircle, Check, Video, Upload, Calendar, Clock, Image as ImageIcon, ChevronUp, ChevronDown, Save, Play, Music, Edit3, List, ArrowLeft, Sparkles, Layout, RefreshCw, LogOut, LogIn
} from 'lucide-react';
import exifr from 'exifr';
import { GoogleGenAI, Type } from "@google/genai";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { firebaseService, type Child, type Photo, type VideoProject } from '@/lib/firebase-service';
import { useChildStore } from '@/lib/store';
import { calculateAgeInMonths, formatAge } from '@/lib/utils';

/**
 * BlobImage Component: Manages Blob URLs to prevent memory leaks.
 */
const BlobImage = ({ blob, ...props }: any) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    if (typeof blob === 'string') {
      setUrl(blob);
      return;
    }
    const newUrl = URL.createObjectURL(blob);
    setUrl(newUrl);
    return () => URL.revokeObjectURL(newUrl);
  }, [blob]);

  if (!url) return null;
  return <Image src={url} {...props} />;
};

/**
 * Main Application Component
 */
export default function App() {
  // --- Auth & Profile State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- Global State (Zustand) ---
  const { activeChildId, setActiveChildId } = useChildStore();

  const [children, setChildren] = useState<Child[] | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[] | undefined>(undefined);
  const [videoProjects, setVideoProjects] = useState<VideoProject[]>([]);

  // --- UI & Lifecycle State ---
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'profiles' | 'video-editor' | 'video-list'>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // --- Upload State ---
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [uploadChildIds, setUploadChildIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // --- Modal & Form State ---
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  
  const [isEditPhotoModalOpen, setIsEditPhotoModalOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTakenAt, setEditTakenAt] = useState('');

  // --- Video Editor State ---
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [storyboard, setStoryboard] = useState<{ photoId: string; caption: string; duration: number }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('classic');

  // --- Firebase Auth Listener ---
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setMounted(true);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Subscriptions (Authenticated & Sub-collection Based) ---
  
  useEffect(() => {
    if (!user) {
      setChildren([]);
      return;
    }
    const unsubscribe = firebaseService.subscribeChildren(user.uid, (data) => {
      setChildren(data);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !activeChildId) {
      setPhotos([]);
      return;
    }
    const unsubscribe = firebaseService.subscribePhotos(user.uid, activeChildId, (data) => {
      setPhotos(data);
    });
    return () => unsubscribe();
  }, [user, activeChildId]);

  useEffect(() => {
    if (!user || !activeChildId) {
      setVideoProjects([]);
      return;
    }
    const unsubscribe = firebaseService.subscribeVideoProjects(user.uid, activeChildId, (data) => {
      setVideoProjects(data);
    });
    return () => unsubscribe();
  }, [user, activeChildId]);

  const activeChild = useMemo(() => 
    children?.find(c => c.id === activeChildId) || null, 
    [children, activeChildId]
  );

  const groupedPhotos = useMemo(() => {
    if (!photos) return [];
    const groups: { monthYear: string; items: Photo[] }[] = [];
    const sorted = [...photos].sort((a, b) => b.takenAt - a.takenAt);
    
    sorted.forEach(photo => {
      const date = new Date(photo.takenAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.monthYear === date) {
        lastGroup.items.push(photo);
      } else {
        groups.push({ monthYear: date, items: [photo] });
      }
    });
    return groups;
  }, [photos]);

  // Handle Initial View
  useEffect(() => {
    if (!mounted || !user || children === undefined) return;
    if (children.length === 0) {
      setView('onboarding');
    } else if (!activeChildId) {
      setActiveChildId(children[0].id || null);
    }
  }, [mounted, user, children, activeChildId, setActiveChildId]);

  // --- Authentication Handlers ---

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError('로그인 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      await signOut(auth);
      setView('dashboard');
      setActiveChildId(null);
    } catch (err: any) {
      setError('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // --- CRUD Handlers ---

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newBirthDate || !user) return;

    try {
      setIsLoading(true);
      const docRef = await firebaseService.addChild(user.uid, {
        name: newName,
        birthDate: newBirthDate,
      });

      setActiveChildId(docRef.id);
      setNewName('');
      setNewBirthDate('');
      setShowAddProfileModal(false);
      if (view === 'onboarding') setView('dashboard');
    } catch (err: any) {
      setError('아이 추가 실패: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChild = async (id: string) => {
    if (!user || !confirm('이 아이의 모든 기록이 영구적으로 삭제됩니다. 계속하시겠습니까?')) return;
    try {
      await firebaseService.deleteChild(user.uid, id);
      if (activeChildId === id) setActiveChildId(null);
    } catch (err: any) {
      setError('삭제 실패: ' + err.message);
    }
  };

  // --- Advanced Upload with Promise.all & Progress Tracking ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!activeChildId) {
      alert('사진을 등록할 아이를 먼저 선택해 주세요.');
      e.target.value = '';
      return;
    }

    setPendingFiles(Array.from(files));
    setUploadChildIds([activeChildId]);
    setIsUploadModalOpen(true);
    e.target.value = '';
  };

  const startUpload = async () => {
    if (!user || !pendingFiles || pendingFiles.length === 0) return;
    if (uploadChildIds.length === 0) {
      alert("아이를 선택해 주세요.");
      return;
    }

    setIsUploadModalOpen(false);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: pendingFiles.length });

    try {
      // Parallel upload with Promise.all
      const uploadTasks = pendingFiles.map(async (file) => {
        let takenAt = file.lastModified;
        try {
          const exif = await exifr.parse(file);
          if (exif?.DateTimeOriginal) takenAt = new Date(exif.DateTimeOriginal).getTime();
        } catch (e) {
          console.warn("EXIF extraction error:", e);
        }

        const ageInMonths = activeChild ? calculateAgeInMonths(activeChild.birthDate, takenAt) : 0;
        let category = ageInMonths <= 12 ? "영아기" : ageInMonths <= 36 ? "유아기" : "아동기";

        const result = await firebaseService.uploadPhoto(user.uid, file, {
          childIds: uploadChildIds,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          takenAt,
          ageInMonths,
          category,
        });

        // Update progress count
        setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
        return result;
      });

      await Promise.all(uploadTasks);
      alert(`${pendingFiles.length}장의 사진이 안전하게 클라우드에 저장되었습니다.`);
    } catch (err: any) {
      console.error("Upload process failed:", err);
      setError('업로드 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsUploading(false);
      setPendingFiles(null);
      setUploadChildIds([]);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if (!user || !confirm('이 사진을 클라우드에서 영구 삭제하시겠습니까?')) return;
    const photo = photos?.find(p => p.id === id);
    if (!photo) return;
    try {
      await firebaseService.deletePhoto(user.uid, id, photo.storagePath);
      setSelectedPhotoIds(prev => prev.filter(pid => pid !== id));
    } catch (err: any) {
      setError('삭제 실패: ' + err.message);
    }
  };

  const handleUpdatePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingPhoto || !editingPhoto.id) return;

    try {
      const takenAt = new Date(editTakenAt).getTime();
      const ageInMonths = activeChild ? calculateAgeInMonths(activeChild.birthDate, takenAt) : editingPhoto.ageInMonths;

      await firebaseService.updatePhoto(user.uid, editingPhoto.id, {
        caption: editCaption,
        category: editCategory,
        takenAt,
        ageInMonths
      });

      setIsEditPhotoModalOpen(false);
      setEditingPhoto(null);
    } catch (err: any) {
      setError('수정 실패: ' + err.message);
    }
  };

  // --- Video Project Handlers ---

  const saveVideoProject = async () => {
    if (!user || !activeChildId) return;
    if (!projectTitle.trim()) {
      setError('프로젝트 제목을 입력해 주세요.');
      return;
    }

    try {
      setIsLoading(true);
      const projectData: Omit<VideoProject, 'id' | 'updatedAt' | 'createdAt'> = {
        childId: activeChildId,
        title: projectTitle,
        scenes: storyboard,
        templateId: selectedTemplate,
        status: 'draft',
      };

      if (editingProjectId) {
        await firebaseService.updateVideoProject(user.uid, editingProjectId, projectData);
      } else {
        await firebaseService.saveVideoProject(user.uid, projectData);
      }

      setView('video-list');
      setSelectedPhotoIds([]);
    } catch (err: any) {
      setError('프로젝트 저장 실패: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!user || !confirm('이 비디오 프로젝트를 삭제하시겠습니까?')) return;
    try {
      await firebaseService.deleteVideoProject(user.uid, id);
    } catch (err: any) {
      setError('프로젝트 삭제 실패: ' + err.message);
    }
  };

  const generateAiCaptions = async () => {
    if (!storyboard.length || !activeChild) return;
    
    setIsGeneratingCaptions(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      const photoParts = await Promise.all(storyboard.map(async (item, index) => {
        const photo = photos?.find(p => p.id === item.photoId);
        if (!photo) return [{ text: `사진 ${index + 1}: [이미지 없음]` }];
        
        const response = await fetch(photo.imageUrl);
        const imageBlob = await response.blob();
        
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        });
        reader.readAsDataURL(imageBlob);
        const base64 = await base64Promise;

        return [
          { text: `사진 ${index + 1} (아이 연령: ${formatAge(photo.ageInMonths)}):` },
          { inlineData: { data: base64, mimeType: photo.mimeType } }
        ];
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `당신은 아이의 성장을 기록하는 감성적인 작가입니다. 
          따뜻한 한국어 자막을 작성해 주세요. JSON 배열 형식으로만 응답하세요.`,
          responseMimeType: "application/json",
          responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        contents: [{ parts: [{ text: `아이 이름: ${activeChild.name}` }, ...photoParts.flat()] }]
      });

      // Vercel build fix: JSON.parse(response.text || "[]")
      const captions = JSON.parse(response.text || "[]");
      if (Array.isArray(captions)) {
        setStoryboard(prev => prev.map((item, index) => ({
          ...item,
          caption: captions[index] || item.caption
        })));
      }
    } catch (err) {
      console.error("AI Captions failed:", err);
      setError("AI 자막 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // --- Sub-Components ---

  const LoginView = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF8F5] p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-10 border border-[#A7C080]/10"
      >
        <div className="w-24 h-24 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto">
          <Baby size={48} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-[#4B4453] mb-4 tracking-tight">성장 기록함</h1>
          <p className="text-[#8E8E8E] leading-relaxed">
            자녀의 소중한 모든 순간을<br />
            클라우드에 안전하게 보관하세요.
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center"><Loader2 className="animate-spin text-[#A7C080]" size={32} /></div>
        ) : (
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-4 bg-white border-2 border-[#E5E5E5] hover:border-[#A7C080] py-4 rounded-2xl font-bold text-[#4B4453] transition-all group"
          >
            <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={24} height={24} alt="Google" />
            <span>구글로 시작하기</span>
          </button>
        )}
        <p className="text-[11px] text-[#BDBDBD]">구글 로그인 시 모든 기기에서 데이터가 실시간 동기화됩니다.</p>
      </motion.div>
    </div>
  );

  // --- Main Render Lifecycle ---

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDF8F5]">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
          <Baby size={48} className="text-[#A7C080]" />
        </motion.div>
        <p className="mt-4 text-[#8E8E8E] font-bold">환경을 준비 중입니다...</p>
      </div>
    );
  }

  if (!user) return <LoginView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF8F5] text-[#4B4453]">
      {/* Network / General Error Pop */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-white border-2 border-red-100 text-red-500 px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4"
          >
            <AlertCircle size={20} />
            <span className="font-bold">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 hover:scale-110 active:scale-90 transition-transform"><X size={20} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Concurrent Upload Progress Overlay */}
      <AnimatePresence>
        {isUploading && (
          <div className="fixed inset-0 z-[100] bg-[#4B4453]/60 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center space-y-6">
              <div className="relative w-24 h-24 mx-auto">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="text-[#FDF8F5] stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" />
                  <motion.circle 
                    className="text-[#A7C080] stroke-current" 
                    strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent"
                    strokeDasharray="251.2"
                    animate={{ strokeDashoffset: 251.2 - (251.2 * (uploadProgress.current / uploadProgress.total)) }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[#A7C080] text-xl">
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">안전하게 저장 중</h3>
                <p className="text-[#8E8E8E] text-sm">클라우드 동기화 {uploadProgress.current} / {uploadProgress.total}</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Confirmation Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 bg-[#4B4453]/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">기록 추가하기</h2>
                <button onClick={() => setIsUploadModalOpen(false)} className="text-gray-300"><X size={24} /></button>
              </div>
              <div className="space-y-3 mb-8">
                {children?.map(child => (
                  <label key={child.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${uploadChildIds.includes(child.id!) ? 'border-[#A7C080] bg-[#A7C080]/5' : 'border-[#FDF8F5] bg-[#FDF8F5]'}`}>
                    <input type="checkbox" className="hidden" checked={uploadChildIds.includes(child.id!)} onChange={() => setUploadChildIds(prev => prev.includes(child.id!) ? prev.filter(id => id !== child.id) : [...prev, child.id!])} />
                    <div className="w-10 h-10 bg-[#A7C080] rounded-xl flex items-center justify-center text-white font-bold">{child.name[0]}</div>
                    <span className="font-bold flex-1">{child.name}</span>
                    {uploadChildIds.includes(child.id!) && <Check size={20} className="text-[#A7C080]" />}
                  </label>
                ))}
              </div>
              <button onClick={startUpload} disabled={uploadChildIds.length === 0} className="w-full py-5 bg-[#A7C080] text-white rounded-[24px] font-bold disabled:opacity-50">업로드 시작하기</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* Onboarding View */}
        {view === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-8">
               <div className="w-20 h-20 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto"><Baby size={40} fill="currentColor" /></div>
               <div><h2 className="text-2xl font-bold">환영합니다, {user.displayName}님!</h2><p className="text-gray-400 mt-2">아이의 첫 번째 프로필을 만들어 보물 상자를 열어보세요.</p></div>
               <form onSubmit={handleAddChild} className="space-y-4">
                 <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none" placeholder="아이의 이름" />
                 <input required type="date" value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none" />
                 <button type="submit" className="w-full bg-[#A7C080] text-white py-5 rounded-[24px] font-bold shadow-lg">상자 열기</button>
               </form>
            </div>
          </motion.div>
        )}

        {/* Dashboard View */}
        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">
            <header className="bg-white border-b border-[#A7C080]/10 sticky top-0 z-30 p-4 shadow-sm backdrop-blur-md bg-white/80">
              <div className="max-w-7xl mx-auto flex justify-between items-center">
                <button onClick={() => setView('profiles')} className="flex items-center gap-4 bg-[#FDF8F5] p-2 pr-6 rounded-2xl border border-[#A7C080]/10 hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-[#A7C080] rounded-xl flex items-center justify-center text-white overflow-hidden relative">
                    {activeChild?.profileImageUrl ? <BlobImage blob={activeChild.profileImageUrl} fill className="object-cover" alt="X" /> : <Baby size={20} />}
                  </div>
                  <div className="text-left"><h2 className="text-sm font-black">{activeChild?.name}</h2><p className="text-[10px] text-gray-400">성장 기록 중</p></div>
                </button>
                <div className="flex items-center gap-4">
                  <div className="sm:flex items-center gap-3 mr-4 bg-gray-50 p-2 rounded-2xl pr-4 border border-gray-100 hidden">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm"><Image src={user.photoURL || ''} width={32} height={32} alt="U" /></div>
                    <span className="text-sm font-bold truncate max-w-[100px]">{user.displayName}</span>
                    <button onClick={handleLogout} className="text-gray-300 hover:text-red-400"><LogOut size={16} /></button>
                  </div>
                  <button onClick={() => setView('video-list')} className="p-3 bg-[#FDF8F5] text-[#8E8E8E] rounded-2xl hover:text-[#A7C080]"><List size={20} /></button>
                  <label className="flex items-center gap-2 px-6 py-3 bg-[#A7C080] text-white rounded-2xl font-bold cursor-pointer hover:bg-[#8FA86A] shadow-md active:scale-95 transition-all">
                    <Upload size={18} /><span>기록하기</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                  </label>
                </div>
              </div>
            </header>

            <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
              {photos === undefined ? (
                <div className="h-[60vh] flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-[#A7C080]" size={48} /><p className="text-gray-400 font-bold">클라우드 동기화 중...</p></div>
              ) : photos.length === 0 ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center"><Camera size={48} className="text-gray-400" /></div>
                  <div><h1 className="text-2xl font-bold">비어 있는 상자</h1><p className="text-[#8E8E8E] mt-2">아이의 첫 번째 소중한 기록을 채워주세요.</p></div>
                </div>
              ) : (
                <div className="space-y-20 pb-40">
                  {groupedPhotos?.map((group) => (
                    <section key={group.monthYear} className="space-y-8">
                      <div className="flex items-center gap-4"><h3 className="text-xl font-black text-[#A7C080] tracking-tight">{group.monthYear}</h3><div className="h-px bg-[#A7C080]/10 flex-1" /></div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {group.items.map((photo) => (
                          <motion.div 
                            key={photo.id} onClick={() => togglePhotoSelection(photo.id!)}
                            whileHover={{ y: -5 }} className={`group relative aspect-square bg-white rounded-[32px] overflow-hidden border-4 shadow-sm transition-all cursor-pointer ${selectedPhotoIds.includes(photo.id!) ? 'border-[#A7C080] scale-95' : 'border-transparent'}`}
                          >
                            <BlobImage blob={photo.imageUrl} fill className="object-cover" alt="Art" />
                            {selectedPhotoIds.includes(photo.id!) && (
                              <div className="absolute inset-0 bg-[#A7C080]/30 backdrop-blur-[1px] flex items-center justify-center"><div className="bg-white p-2 rounded-full text-[#A7C080] shadow-xl"><Check size={24} strokeWidth={4} /></div></div>
                            )}
                            <div className="absolute top-2 left-2 px-3 py-1 bg-white/80 backdrop-blur-md rounded-xl text-[10px] font-black text-[#A7C080] shadow-sm">{formatAge(photo.ageInMonths)}</div>
                            <button onClick={(e) => { e.stopPropagation(); handleEditPhoto(photo); }} className="absolute bottom-2 right-2 p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all"><Edit3 size={14} /></button>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </main>

            {/* Float Action: Create Video */}
            <AnimatePresence>
              {selectedPhotoIds.length > 0 && (
                <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-6">
                  <div className="bg-[#4B4453] text-white p-5 rounded-[40px] shadow-2xl flex items-center justify-between border border-white/10 backdrop-blur-xl">
                    <span className="font-bold ml-4">{selectedPhotoIds.length}개 선택</span>
                    <div className="flex gap-4">
                      <button onClick={() => setSelectedPhotoIds([])} className="text-sm text-gray-400 px-2">해제</button>
                      <button onClick={startNewVideoProject} className="bg-[#A7C080] px-6 py-4 rounded-[28px] font-black flex items-center gap-2 hover:bg-[#8FA86A] transition-all"><Video size={20} /> 보물 영상 제작</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Video Editor View */}
        {view === 'video-editor' && (
          <motion.div key="video-editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col bg-white">
            <header className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-40">
              <div className="flex items-center gap-6">
                <button onClick={() => setView('dashboard')} className="p-3 bg-gray-50 rounded-2xl"><ArrowLeft size={24} /></button>
                <div><label className="text-[10px] text-gray-400 font-bold block ml-1 uppercase">Project Title</label><input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="text-2xl font-black bg-transparent outline-none border-b-4 border-transparent focus:border-[#A7C080] transition-all" /></div>
              </div>
              <button onClick={saveVideoProject} className="bg-[#A7C080] text-white px-8 py-4 rounded-[24px] font-black shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center gap-2"><Save size={20} /> 저장하기</button>
            </header>
            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
               <div className="p-10 overflow-y-auto space-y-6 border-r border-gray-50">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-black">장면 구성</h3><button onClick={generateAiCaptions} disabled={isGeneratingCaptions} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#A7C080]/10 to-[#A7C080]/5 text-[#A7C080] rounded-2xl font-bold border border-[#A7C080]/20 hover:scale-105 transition-all">{isGeneratingCaptions ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />} AI 자막 쓰기</button></div>
                  <div className="space-y-4 pb-20">
                    {storyboard.map((item, index) => {
                       const photo = photos?.find(p => p.id === item.photoId);
                       return (
                         <motion.div layout key={index} className="bg-gray-50 p-5 rounded-[32px] flex gap-6 items-start group relative border border-gray-100">
                           <div className="w-32 h-32 relative rounded-3xl overflow-hidden shadow-md shrink-0"><BlobImage blob={photo?.imageUrl} fill className="object-cover" alt="S" /></div>
                           <div className="flex-1 space-y-3 pt-1">
                              <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#A7C080] uppercase tracking-widest">Scene {index + 1}</span><div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold"><Clock size={12} /> {item.duration}s</div></div>
                              <textarea value={item.caption} onChange={e => { const n = [...storyboard]; n[index].caption = e.target.value; setStoryboard(n); }} className="w-full p-4 bg-white rounded-2xl outline-none text-sm h-28 resize-none border border-transparent focus:border-[#A7C080]/30 shadow-sm" placeholder="여기에 추억의 자막을 적어주세요." />
                           </div>
                           <button onClick={() => setStoryboard(prev => prev.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 p-2 bg-white text-gray-300 hover:text-red-400 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all border border-gray-100"><Trash2 size={16} /></button>
                         </motion.div>
                       );
                    })}
                  </div>
               </div>
               <div className="bg-[#4B4453] p-12 flex flex-col items-center justify-center text-white space-y-10 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none"><Layout className="w-full h-full" /></div>
                  <div className="w-full aspect-video bg-black/40 rounded-[40px] shadow-2xl flex items-center justify-center flex-col gap-4 border border-white/5 relative group cursor-pointer overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8"><p className="text-xl font-bold opacity-80 italic">"미리보기 영상이 준비될 장소입니다"</p></div>
                     <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 4 }} className="bg-white/10 p-10 rounded-full backdrop-blur-md group-hover:bg-white/20 transition-all"><Play size={64} fill="currentColor" /></motion.div>
                  </div>
                  <div className="w-full max-w-sm space-y-6">
                     <h4 className="text-center font-black text-gray-400 tracking-widest uppercase text-xs">Template & Emotion</h4>
                     <div className="grid grid-cols-2 gap-4">
                        {['Classic', 'Modern', 'Pop', 'Soft'].map(t => (
                          <button key={t} onClick={() => setSelectedTemplate(t.toLowerCase())} className={`py-6 rounded-3xl font-black transition-all ${selectedTemplate === t.toLowerCase() ? 'bg-[#A7C080] text-[#4B4453]' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`}>{t}</button>
                        ))}
                     </div>
                  </div>
               </div>
            </main>
          </motion.div>
        )}

        {/* Video Library View */}
        {view === 'video-list' && (
          <motion.div key="video-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col p-10 max-w-5xl mx-auto w-full space-y-12">
            <div className="flex items-center gap-6">
              <button onClick={() => setView('dashboard')} className="p-4 bg-white rounded-3xl shadow-sm text-gray-400 hover:text-[#A7C080] transition-all"><ArrowLeft size={24} /></button>
              <h1 className="text-4xl font-black tracking-tight">{activeChild?.name}의 보물 상자 <span className="text-gray-200">/</span> 비디오</h1>
            </div>
            {videoProjects.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-4 opacity-50"><Video size={80} /><p className="font-bold">아직 제작된 영상 보물이 없습니다.</p></div>
            ) : (
              <div className="grid gap-6">
                {videoProjects.map(project => (
                  <motion.div key={project.id} whileHover={{ x: 10 }} className="bg-white p-8 rounded-[48px] shadow-sm flex items-center justify-between group hover:shadow-xl transition-all border border-gray-50">
                    <div className="flex items-center gap-10">
                      <div className="w-20 h-20 bg-[#FDF8F5] rounded-[30px] flex items-center justify-center text-[#A7C080] shadow-inner"><Video size={40} /></div>
                      <div>
                        <h3 className="text-2xl font-black mb-1">{project.title}</h3>
                        <div className="flex gap-4 text-sm text-gray-300 font-bold"><span className="flex items-center gap-1"><Calendar size={14} /> {new Date(project.createdAt).toLocaleDateString()}</span><span className="flex items-center gap-1"><ImageIcon size={14} /> {project.scenes.length} Scenes</span></div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button onClick={() => { setEditingProjectId(project.id!); setProjectTitle(project.title); setStoryboard(project.scenes); setView('video-editor'); }} className="p-5 bg-[#FDF8F5] text-[#A7C080] rounded-[24px] hover:bg-[#A7C080] hover:text-white shadow-sm transition-all"><Edit3 size={24} /></button>
                      <button onClick={() => deleteProject(project.id!)} className="p-5 text-gray-100 hover:text-red-400 active:scale-95 transition-all"><Trash2 size={24} /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Switching / Management */}
      <AnimatePresence>
        {view === 'profiles' && (
          <div className="fixed inset-0 bg-[#4B4453]/60 backdrop-blur-xl z-[150] flex items-center justify-center p-6">
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg p-12 rounded-[60px] shadow-2xl relative border border-white/20">
                <button onClick={() => setView('dashboard')} className="absolute top-8 right-8 text-gray-300 hover:text-[#4B4453] transition-colors"><X size={32} /></button>
                <div className="mb-12"><h2 className="text-3xl font-black mb-2">누구의 상자를 열까요?</h2><p className="text-gray-400 font-bold">아이들의 소중한 기록을 선택해 보세요.</p></div>
                <div className="grid grid-cols-2 gap-6 mb-12">
                  {children?.map(child => (
                    <motion.div 
                      key={child.id} layout whileHover={{ scale: 1.05 }}
                      onClick={() => { setActiveChildId(child.id!); setView('dashboard'); }}
                      className={`relative p-8 rounded-[40px] border-4 cursor-pointer text-center group transition-all ${activeChildId === child.id ? 'border-[#A7C080] bg-[#A7C080]/5' : 'border-gray-50 bg-gray-50'}`}
                    >
                      <div className="w-20 h-20 bg-[#A7C080] rounded-[30px] flex items-center justify-center text-white text-3xl font-black mx-auto mb-4 group-hover:shadow-lg transition-all">{child.name[0]}</div>
                      <span className="font-black text-xl">{child.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteChild(child.id!); }} className="absolute -top-3 -right-3 p-3 bg-white text-gray-200 hover:text-red-400 rounded-full shadow-lg border border-gray-100 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={20} /></button>
                    </motion.div>
                  ))}
                  <button onClick={() => setShowAddProfileModal(true)} className="flex flex-col items-center justify-center p-8 rounded-[40px] border-4 border-dashed border-gray-100 text-gray-300 hover:border-[#A7C080] hover:text-[#A7C080] transition-all gap-4">
                    <div className="p-4 bg-gray-50 rounded-full"><Plus size={32} /></div><span className="font-bold">추가하기</span>
                  </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form: Add New Child Profile */}
      <AnimatePresence>
        {showAddProfileModal && (
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-md p-10 rounded-[50px] shadow-2xl">
              <div className="flex justify-between items-center mb-10"><h3 className="text-2xl font-black">프로필 만들기</h3><button onClick={() => setShowAddProfileModal(false)} className="text-gray-300"><X size={24} /></button></div>
              <form onSubmit={handleAddChild} className="space-y-6">
                <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Name</label><input type="text" required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/30 transition-all" placeholder="아이의 예쁜 이름을 적어주세요" /></div>
                <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Birthday</label><input type="date" required value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/30 transition-all" /></div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowAddProfileModal(false)} className="flex-1 py-5 text-gray-400 font-bold">나중에 하기</button>
                  <button type="submit" className="flex-1 py-5 bg-[#A7C080] text-white rounded-[24px] font-black shadow-lg">상자 만들기</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Modal: Edit Photo Metadata */}
      <AnimatePresence>
        {isEditPhotoModalOpen && editingPhoto && (
          <div className="fixed inset-0 bg-[#4B4453]/60 backdrop-blur-md z-[150] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-4xl p-10 rounded-[60px] flex shadow-2xl gap-12 relative overflow-hidden">
              <button onClick={() => setIsEditPhotoModalOpen(false)} className="absolute top-8 right-8 text-gray-300"><X size={32} /></button>
              <div className="w-[45%] aspect-square relative rounded-[40px] overflow-hidden shadow-2xl border-2 border-gray-50"><BlobImage blob={editingPhoto.imageUrl} fill className="object-cover" alt="Editor" /></div>
              <div className="flex-1 flex flex-col justify-center space-y-8">
                <div><h3 className="text-3xl font-black mb-2">기록 수정</h3><p className="text-gray-400 font-bold">소중한 우리 아이의 추억을 더 정확하게 기록해 주세요.</p></div>
                <div className="space-y-6">
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Date Taken</label><input type="date" value={editTakenAt} onChange={e => setEditTakenAt(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold shadow-inner" /></div>
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Category</label><select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold border-r-8 border-transparent">
                      <option value="영아기">영아기 (0-12개월)</option><option value="유아기">유아기 (13-36개월)</option><option value="아동기">아동기 (36개월+)</option><option value="기타">기타</option>
                   </select></div>
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Memory Caption</label><textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} className="w-full p-6 bg-gray-50 rounded-[32px] h-40 outline-none resize-none font-medium text-sm shadow-inner" placeholder="이 순간을 기억할 따뜻한 메모를 남겨주세요." /></div>
                </div>
                <div className="flex gap-6 pt-4">
                  <button onClick={() => handleDeletePhoto(editingPhoto.id!)} className="p-5 text-gray-200 hover:text-red-400 hover:bg-red-50 rounded-[24px] transition-all"><Trash2 size={24} /></button>
                  <button onClick={handleUpdatePhoto} className="flex-1 py-6 bg-[#A7C080] text-white rounded-[24px] font-black shadow-xl hover:shadow-2xl active:scale-95 transition-all">수정 내용 저장</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
