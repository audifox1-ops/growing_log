"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Baby, Plus, Trash2, X, Camera, Loader2, AlertCircle, Check, Video, Upload, Calendar, Clock, Image as ImageIcon, Save, Play, Edit3, List, ArrowLeft, Sparkles, Layout, LogOut, User as UserIcon, MessageSquare
} from 'lucide-react';
import exifr from 'exifr';
import { GoogleGenAI, Type } from "@google/genai";
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { firebaseService, type Child, type Photo, type VideoProject } from '@/lib/firebase-service';
import { useChildStore } from '@/lib/store';
import { calculateAgeInMonths, formatAge } from '@/lib/utils';

/**
 * BlobImage Component: Manages Blob URLs and handles loading errors.
 */
const BlobImage = ({ blob, alt, ...props }: any) => {
  const [url, setUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    if (!blob) { setUrl(null); setHasError(false); return; }
    if (typeof blob === 'string') { setUrl(blob); setHasError(false); return; }
    const newUrl = URL.createObjectURL(blob);
    setUrl(newUrl);
    setHasError(false);
    return () => URL.revokeObjectURL(newUrl);
  }, [blob]);
  if (hasError || !url) {
    return <div className="w-full h-full bg-[#F3F0E9] flex items-center justify-center text-gray-300"><ImageIcon size={24} /></div>;
  }
  return <Image src={url} alt={alt || "이미지"} onError={() => setHasError(true)} {...props} />;
};

// --- Framer Motion Variants ---
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function App() {
  // --- Auth & Profile State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileImgError, setProfileImgError] = useState(false);
  const { activeChildId, setActiveChildId } = useChildStore();

  // --- Data State ---
  const [children, setChildren] = useState<Child[] | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[] | undefined>(undefined);
  const [videoProjects, setVideoProjects] = useState<VideoProject[]>([]);

  // --- UI & Lifecycle State ---
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'profiles' | 'video-editor' | 'video-list'>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // --- Upload State ---
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [uploadChildIds, setUploadChildIds] = useState<string[]>([]);
  const [pendingCaption, setPendingCaption] = useState(''); // [NEW] 한 줄 메모 상태
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
    if (!auth) { setAuthLoading(false); return; }
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) console.log("Login Success");
      } catch (err: any) {
        console.error("Redirect error", err);
      } finally { setIsLoading(false); }
    };
    checkRedirectResult();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setMounted(true);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Subscriptions with Index Error Handling ---
  useEffect(() => {
    if (!user) { setChildren([]); return; }
    return firebaseService.subscribeChildren(user.uid, (data) => {
      setChildren(data);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !activeChildId) { setPhotos([]); return; }
    /**
     * [IMPROVED] 색인 에러는 firebase-service.ts에서 1차 로깅하며, 
     * 여기서도 에러 발생 시 UI 상태를 안전하게 유지합니다.
     */
    return firebaseService.subscribePhotos(user.uid, activeChildId, (data) => setPhotos(data));
  }, [user, activeChildId]);

  useEffect(() => {
    if (!user || !activeChildId) { setVideoProjects([]); return; }
    return firebaseService.subscribeVideoProjects(user.uid, activeChildId, (data) => setVideoProjects(data));
  }, [user, activeChildId]);

  const activeChild = useMemo(() => children?.find(c => c.id === activeChildId) || null, [children, activeChildId]);

  const groupedPhotos = useMemo(() => {
    if (!photos) return [];
    const groups: { monthYear: string; items: Photo[] }[] = [];
    const sorted = [...photos].sort((a, b) => b.takenAt - a.takenAt);
    sorted.forEach(photo => {
      const date = new Date(photo.takenAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.monthYear === date) lastGroup.items.push(photo);
      else groups.push({ monthYear: date, items: [photo] });
    });
    return groups;
  }, [photos]);

  /** View transition safety */
  useEffect(() => {
    if (!mounted || !user || children === undefined) return;
    if (children.length === 0) {
      if (view !== 'onboarding') setView('onboarding');
    } else {
      if (view === 'onboarding') setView('dashboard');
      if (!activeChildId) setActiveChildId(children[0].id || null);
    }
  }, [mounted, user, children, activeChildId, setActiveChildId, view]);

  // --- Handlers ---

  const handleLogin = async () => {
    try { 
      setIsLoading(true); 
      await signInWithRedirect(auth, googleProvider); 
    } catch (err: any) { 
      setError(err.message); 
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
      setError('로그아웃 실패'); 
    }
  };

  const handleAddChild = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newName.trim() || !newBirthDate || !user) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const docRef = await firebaseService.addChild(user.uid, { name: newName.trim(), birthDate: newBirthDate });
      setActiveChildId(docRef.id);
      setNewName(''); setNewBirthDate(''); setShowAddProfileModal(false);
      if (view === 'onboarding') setView('dashboard');
    } catch (err: any) {
      setError('아이 추가 실패: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChild = async (id: string) => {
    if (!user || !confirm('삭제하시겠습니까?')) return;
    try { await firebaseService.deleteChild(user.uid, id); if (activeChildId === id) setActiveChildId(null); }
    catch (err: any) { setError('삭제 실패'); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!activeChildId) { alert('아이를 먼저 선택해 주세요.'); return; }
    setPendingFiles(Array.from(files));
    setUploadChildIds([activeChildId]);
    setPendingCaption(''); // 리셋 메모
    setIsUploadModalOpen(true);
    e.target.value = '';
  };

  /**
   * [IMPROVED] 업로드 처리 로직
   * - try-catch-finally를 통한 안정적인 로딩 해제
   * - firebase-service.ts에서 contentType 메타데이터가 자동으로 부여됨
   */
  const startUpload = async () => {
    if (!user || !pendingFiles || pendingFiles.length === 0) return;
    setIsUploadModalOpen(false);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: pendingFiles.length });
    try {
      await Promise.all(pendingFiles.map(async (file) => {
        let takenAt = file.lastModified;
        try {
          const exif = await exifr.parse(file);
          if (exif?.DateTimeOriginal) takenAt = new Date(exif.DateTimeOriginal).getTime();
        } catch (e) {}
        const ageInMonths = activeChild ? calculateAgeInMonths(activeChild.birthDate, takenAt) : 0;
        let category = ageInMonths <= 12 ? "영아기" : ageInMonths <= 36 ? "유아기" : "아동기";
        
        await firebaseService.uploadPhoto(user.uid, file, { 
          childIds: uploadChildIds, 
          fileName: file.name, 
          fileSize: file.size, 
          mimeType: file.type || 'image/jpeg', 
          takenAt, 
          ageInMonths, 
          category,
          caption: pendingCaption // [NEW] 입력받은 메모 저장
        });
        setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }));
    } catch (err: any) { 
      console.error("Upload error", err);
      setError('업로드 실패: ' + err.message); 
    } finally { 
      setIsUploading(false); 
      setPendingFiles(null); 
      setUploadChildIds([]); 
      setPendingCaption('');
    }
  };

  const togglePhotoSelection = (id: string) => setSelectedPhotoIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  const handleEditPhoto = (p: Photo) => { setEditingPhoto(p); setEditCaption(p.caption || ''); setEditCategory(p.category || ''); setEditTakenAt(new Date(p.takenAt).toISOString().split('T')[0]); setIsEditPhotoModalOpen(true); };
  const startNewVideoProject = () => { if (selectedPhotoIds.length === 0) return; setProjectTitle(`${activeChild?.name}의 보물 영상 (${new Date().toLocaleDateString()})`); setStoryboard(selectedPhotoIds.map(id => ({ photoId: id, caption: '', duration: 3 }))); setEditingProjectId(null); setView('video-editor'); };
  const handleDeletePhoto = async (id: string) => { if (!user || !confirm('삭제하시겠습니까?')) return; try { await firebaseService.deletePhoto(user.uid, id); setSelectedPhotoIds(prev => prev.filter(pid => pid !== id)); setIsEditPhotoModalOpen(false); setEditingPhoto(null); } catch (err: any) { setError('삭제 실패'); } };

  const handleUpdatePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingPhoto?.id) return;
    try {
      const takenAt = new Date(editTakenAt).getTime();
      const ageInMonths = activeChild ? calculateAgeInMonths(activeChild.birthDate, takenAt) : editingPhoto.ageInMonths;
      await firebaseService.updatePhoto(user.uid, editingPhoto.id, { caption: editCaption, category: editCategory, takenAt, ageInMonths });
      setIsEditPhotoModalOpen(false); setEditingPhoto(null);
    } catch (err: any) { setError('수정 실패'); }
  };

  const saveVideoProject = async () => {
    if (!user || !activeChildId || !projectTitle.trim()) return;
    try {
      setIsLoading(true);
      const data: Omit<VideoProject, 'id'|'updatedAt'|'createdAt'> = { childId: activeChildId, title: projectTitle, scenes: storyboard, templateId: selectedTemplate, status: 'draft' };
      if (editingProjectId) await firebaseService.updateVideoProject(user.uid, editingProjectId, data);
      else await firebaseService.saveVideoProject(user.uid, data);
      setView('video-list'); setSelectedPhotoIds([]);
    } catch (err: any) { setError('저장 실패'); } finally { setIsLoading(false); }
  };

  const deleteProject = async (id: string) => { if (!user || !confirm('삭제하시겠습니까?')) return; try { await firebaseService.deleteVideoProject(user.uid, id); } catch (err: any) { setError('삭제 실패'); } };

  const generateAiCaptions = async () => {
    if (!storyboard.length || !activeChild) return;
    setIsGeneratingCaptions(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      const photoParts = await Promise.all(storyboard.map(async (item, index) => {
        const photo = photos?.find(p => p.id === item.photoId);
        if (!photo) return [{ text: `사진 ${index + 1}: [이미지 없음]` }];
        
        // Base64 데이터에서 실제 데이터 부분만 추출 (data:image/jpeg;base64, 접두사 제거)
        const base64Data = photo.imageUrl.includes(',') ? photo.imageUrl.split(',')[1] : photo.imageUrl;
        
        return [{ text: `사진 ${index + 1} (아이 연령: ${formatAge(photo.ageInMonths)}):` }, { inlineData: { data: base64Data, mimeType: photo.mimeType } }];
      }));
      const res = await ai.models.generateContent({ model: "gemini-3-flash-preview", config: { responseMimeType: "application/json" }, contents: [{ parts: [{ text: `아이 이름: ${activeChild.name}` }, ...photoParts.flat()] }] });
      const captions = JSON.parse(res.text || "[]");
      if (Array.isArray(captions)) setStoryboard(prev => prev.map((item, index) => ({ ...item, caption: captions[index] || item.caption })));
    } catch (err) { setError("AI 자막 생성 실패"); } finally { setIsGeneratingCaptions(false); }
  };

  // --- Views ---

  const LoginView = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF8F5] p-6 relative z-10 overflow-hidden font-sans">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-white p-12 rounded-[60px] shadow-2xl text-center space-y-10 relative z-20">
        <div className="w-24 h-24 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto opacity-80"><Baby size={48} fill="currentColor" /></div>
        <div>
          <h1 className="text-4xl font-black text-[#4B4453] mb-4 tracking-tighter">성장 기록함</h1>
          <p className="text-[#8E8E8E] leading-relaxed font-medium">따뜻한 기억들을<br />하나씩 상자에 담아보세요.</p>
        </div>
        <div className="relative z-30">
          <div className="space-y-4">
            {isLoading && <div className="flex justify-center flex-col items-center gap-4 py-4 animate-pulse"><Loader2 className="animate-spin text-[#A7C080]" size={32} /><p className="text-xs text-[#A7C080] font-black uppercase tracking-widest">분주하게 준비 중</p></div>}
            <button type="button" onClick={handleLogin} className="w-full relative z-[100] flex items-center justify-center gap-4 bg-white border-2 border-[#F3EDEA] hover:border-[#A7C080] py-5 rounded-[32px] font-black text-[#4B4453] transition-all hover:bg-[#FDF8F5] active:scale-[0.98] shadow-sm"><Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={24} height={24} alt="G" /><span className="text-xl">상자 열기</span></button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  if (!mounted || authLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDF8F5]">
      <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-[#A7C080]"><Baby size={64} fill="currentColor" /></motion.div>
      <p className="mt-8 text-[#A7C080] font-black uppercase tracking-[0.2em] text-[10px]">상자를 가져오는 중</p>
    </div>
  );

  if (!user) return <LoginView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF8F5] text-[#4B4453] font-sans selection:bg-[#A7C080]/20">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-white border-2 border-red-50 px-8 py-4 rounded-[24px] shadow-2xl flex items-center gap-4">
            <AlertCircle size={20} className="text-red-400" />
            <span className="font-bold text-red-500 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="text-gray-300 hover:text-gray-500"><X size={20} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isUploading && (
          <div className="fixed inset-0 z-[250] bg-[#4B4453]/40 backdrop-blur-lg flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-12 rounded-[60px] shadow-2xl max-w-sm w-full text-center space-y-8">
              <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-[#F3EDEA] stroke-current" strokeWidth="6" cx="50" cy="50" r="44" fill="transparent" />
                  <motion.circle className="text-[#A7C080] stroke-current" strokeWidth="6" strokeLinecap="round" cx="50" cy="50" r="44" fill="transparent" strokeDasharray="276.5" animate={{ strokeDashoffset: 276.5 - (276.5 * (uploadProgress.current / uploadProgress.total)) }} transition={{ duration: 0.5 }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[#A7C080] text-3xl">{Math.round((uploadProgress.current/uploadProgress.total)*100)}%</div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black">기억을 소중히 담는 중</h3>
                <p className="text-[#8E8E8E] text-sm font-medium">{uploadProgress.current} / {uploadProgress.total} 사진 동기화</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 bg-[#4B4453]/30 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-md p-10 rounded-[60px] shadow-2xl relative">
              <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-8 right-8 text-gray-300 hover:text-gray-500 transition-colors"><X size={32} /></button>
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-black mb-2">오늘의 일기 한 줄</h2>
                <p className="text-gray-400 font-medium">기억하고 싶은 말을 남겨보세요.</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] text-gray-400 font-black tracking-widest ml-3 uppercase">누구의 사진인가요?</label>
                  <div className="grid grid-cols-2 gap-3">
                    {children?.map(child => (
                      <button key={child.id} onClick={() => setUploadChildIds(prev => prev.includes(child.id!) ? prev.filter(id => id !== child.id) : [...prev, child.id!])} className={`flex items-center gap-3 p-4 rounded-[24px] border-2 transition-all ${uploadChildIds.includes(child.id!) ? 'border-[#A7C080] bg-[#A7C080]/5' : 'border-[#FDF8F5] bg-[#FDF8F5]'}`}>
                        <div className="w-8 h-8 bg-[#A7C080] rounded-xl flex items-center justify-center text-white font-black text-xs">{child.name[0]}</div>
                        <span className="font-bold text-sm">{child.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] text-gray-400 font-black tracking-widest ml-3 uppercase">한 줄 메모</label>
                  <textarea value={pendingCaption} onChange={e => setPendingCaption(e.target.value)} className="w-full p-6 bg-[#FDF8F5] rounded-[32px] outline-none font-medium text-sm h-32 resize-none border-2 border-transparent focus:border-[#A7C080]/30" placeholder="아이가 오늘 처음으로 웃었어요!" />
                </div>
                
                <button onClick={startUpload} className="w-full py-6 bg-[#A7C080] text-white rounded-[32px] font-black text-xl shadow-lg hover:bg-[#8FA86A] transition-all transform hover:-translate-y-1 active:translate-y-0">상자에 담기</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white p-12 rounded-[60px] shadow-2xl text-center space-y-8 relative overflow-hidden">
               <div className="w-20 h-20 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto"><Baby size={40} fill="currentColor" /></div>
               <div className="space-y-2">
                 <h2 className="text-2xl font-black tracking-tight">{user.displayName}님, 반가워요!</h2>
                 <p className="text-gray-400 font-medium">아이의 상자를 처음 열기 위해 이름과 생일을 적어보세요.</p>
               </div>
               <form onSubmit={handleAddChild} className="space-y-6 text-left">
                 <div className="space-y-2">
                   <label className="text-[10px] text-gray-300 font-black ml-4 uppercase tracking-[0.2em]">아이 이름</label>
                   <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-6 bg-[#FDF8F5] rounded-[28px] outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/20" placeholder="이름" />
                 </div>
                 <div className="space-y-2 text-left">
                   <label className="text-[10px] text-gray-300 font-black ml-4 uppercase tracking-[0.2em]">생년월일</label>
                   <input required type="date" value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} className="w-full p-6 bg-[#FDF8F5] rounded-[28px] outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/20" />
                 </div>
                 <button type="submit" disabled={isLoading} className="w-full bg-[#A7C080] text-white py-6 rounded-[32px] font-black shadow-lg flex items-center justify-center gap-3 disabled:opacity-70 text-lg">{isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}<span>상자 열기</span></button>
               </form>
            </div>
          </motion.div>
        )}

        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col pt-4">
            <header className="px-6 py-6 sticky top-0 z-[100] max-w-7xl mx-auto w-full">
              <nav className="bg-white/80 backdrop-blur-2xl px-6 py-4 rounded-[40px] shadow-sm border border-white/40 flex justify-between items-center transition-all hover:shadow-md">
                <button onClick={() => setView('profiles')} className="flex items-center gap-4 group">
                  <div className="w-12 h-12 bg-[#F3EDEA] rounded-[20px] flex items-center justify-center text-[#A7C080] overflow-hidden relative shadow-inner ring-4 ring-[#FDF8F5] group-hover:scale-110 transition-transform">
                    {activeChild?.profileImageUrl ? <BlobImage blob={activeChild.profileImageUrl} fill className="object-cover" alt="P" /> : <Baby size={22} fill="currentColor" opacity="0.5" />}
                  </div>
                  <div className="text-left">
                    <h2 className="text-base font-black tracking-tight flex items-center gap-2">{activeChild?.name}<Calendar size={12} className="text-[#A7C080] opacity-50" /></h2>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{activeChild && formatAge(calculateAgeInMonths(activeChild.birthDate, Date.now()))}</p>
                  </div>
                </button>
                
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-4 bg-[#FDF8F5] px-5 py-3 rounded-[24px] border border-[#F3EDEA]">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm relative flex items-center justify-center bg-[#F3EDEA]">
                      {user.photoURL && !profileImgError ? (
                        <Image src={user.photoURL} width={32} height={32} alt="U" unoptimized className="w-full h-full object-cover" onError={() => setProfileImgError(true)} />
                      ) : ( <UserIcon size={16} className="text-[#A7C080] opacity-40" /> )}
                    </div>
                    <span className="text-xs font-black text-[#8E8E8E] tracking-tight">{user.displayName}</span>
                    <button onClick={handleLogout} className="text-[#E5E5E5] hover:text-red-400 transition-colors"><LogOut size={16} /></button>
                  </div>
                  <button onClick={() => setView('video-list')} className="p-4 bg-[#FDF8F5] text-gray-400 rounded-[22px] hover:bg-[#A7C080]/10 hover:text-[#A7C080] transition-all"><List size={22} /></button>
                  <label className="flex items-center gap-3 px-8 py-4 bg-[#A7C080] text-white rounded-[24px] font-black cursor-pointer hover:bg-[#8FA86A] shadow-xl shadow-[#A7C080]/20 transition-all hover:-translate-y-0.5 active:translate-y-0">
                    {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                    <span className="text-base">{isUploading ? '저장 중' : '담기'}</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} disabled={isUploading}/>
                  </label>
                </div>
              </nav>
            </header>
            
            <main className="flex-1 px-8 pb-32 max-w-7xl mx-auto w-full">
              {photos === undefined ? (
                <div className="h-[60vh] flex flex-col items-center justify-center gap-6"><Loader2 className="animate-spin text-[#A7C080] opacity-30" size={64} /><p className="text-gray-300 font-black tracking-widest text-xs uppercase">상자를 뒤적거리는 중</p></div>
              ) : photos.length === 0 ? (
                <div className="h-[65vh] flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-1000">
                  <div className="w-40 h-40 bg-white/50 rounded-[60px] flex items-center justify-center shadow-inner ring-8 ring-white/30"><ImageIcon size={64} className="text-[#F3EDEA]" /></div>
                  <div className="space-y-3">
                    <h1 className="text-3xl font-black tracking-tighter text-gray-400/50">아직 텅 비어있는 상자</h1>
                    <p className="text-[#8E8E8E] font-medium text-lg">아이의 예쁜 순간들을 하나씩 소중하게<br />이 상자에 가득 채워주세요.</p>
                  </div>
                </div>
              ) : (
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-32 mt-12">
                  {groupedPhotos?.map((group) => (
                    <section key={group.monthYear} className="space-y-12 relative">
                      <div className="sticky top-[150px] z-20 pointer-events-none">
                        <div className="flex items-center gap-6 bg-[#FDF8F5]/80 backdrop-blur-sm py-4 inline-flex pr-6 rounded-r-3xl">
                          <h3 className="text-3xl font-black text-[#A7C080] tracking-tight pl-2">{group.monthYear}</h3>
                          <div className="flex-1 h-[2px] w-24 bg-[#A7C080]/10 rounded-full" />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-10">
                        {group.items.map((photo) => (
                          <motion.div variants={fadeInUp} viewport={{ once: true }} key={photo.id} onClick={() => togglePhotoSelection(photo.id!)} className={`group relative flex flex-col bg-white p-4 rounded-[48px] shadow-sm transition-all hover:shadow-2xl hover:scale-[1.02] border-4 ${selectedPhotoIds.includes(photo.id!) ? 'border-[#A7C080]' : 'border-white'} cursor-pointer`}>
                            <div className="aspect-[4/5] relative rounded-[36px] overflow-hidden mb-5 bg-[#FDF8F5]">
                              <BlobImage blob={photo.imageUrl} fill className="object-cover" alt="Memory" />
                              {selectedPhotoIds.includes(photo.id!) && (
                                <div className="absolute inset-0 bg-[#A7C080]/20 backdrop-blur-[2px] flex items-center justify-center">
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="bg-white p-3 rounded-full text-[#A7C080] shadow-2xl ring-4 ring-white/50"><Check size={32} strokeWidth={4} /></motion.div>
                                </div>
                              )}
                              <div className="absolute top-4 left-4 px-4 py-2 bg-white/90 backdrop-blur-md rounded-[18px] text-[10px] font-black text-[#A7C080] shadow-sm tracking-tight">{formatAge(photo.ageInMonths)}</div>
                              <button onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id!); }} className="absolute top-4 right-4 p-3 bg-red-400/90 text-white rounded-[18px] opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:scale-110 shadow-lg"><Trash2 size={18} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleEditPhoto(photo); }} className="absolute bottom-4 right-4 p-3 bg-[#A7C080]/90 text-white rounded-[18px] opacity-0 group-hover:opacity-100 transition-all hover:bg-[#8FA86A] hover:scale-110 shadow-lg"><Edit3 size={18} /></button>
                            </div>
                            
                            <div className="px-4 pb-4 text-center">
                              {photo.caption ? (
                                <p className="text-base font-bold text-[#4B4453]/80 leading-relaxed italic line-clamp-2">" {photo.caption} "</p>
                              ) : (
                                <p className="text-xs font-black uppercase text-[#E5E5E5] tracking-[0.2em] italic">No Memo</p>
                              )}
                              <div className="flex items-center justify-center mt-3 text-[10px] font-black text-[#BDBDBD] uppercase tracking-widest gap-2">
                                <Clock size={10} /> {new Date(photo.takenAt).toLocaleDateString()}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  ))}
                </motion.div>
              )}
            </main>
            <AnimatePresence>
              {selectedPhotoIds.length > 0 && (
                <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] bg-[#4B4453] bg-opacity-95 backdrop-blur-2xl text-white px-8 py-5 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] flex items-center justify-between border border-white/10 w-full max-w-sm">
                  <div className="flex flex-col">
                    <span className="font-black text-xs uppercase tracking-widest opacity-50 mb-1">Selected</span>
                    <span className="text-xl font-black">{selectedPhotoIds.length}장의 사진</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setSelectedPhotoIds([])} className="p-4 text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
                    <button onClick={startNewVideoProject} className="bg-[#A7C080] px-8 py-4 rounded-[28px] font-black flex items-center gap-3 transition-all hover:bg-[#8FA86A] hover:scale-105 active:scale-95"><Video size={22} fill="currentColor" /> 영상 제작</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {view === 'video-editor' && (
          <motion.div key="video-editor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col bg-white">
            <header className="p-8 border-b-2 border-[#FDF8F5] flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-[110]">
              <div className="flex items-center gap-8">
                <button onClick={() => setView('dashboard')} className="p-4 bg-[#FDF8F5] rounded-[24px] text-gray-400 hover:bg-[#A7C080]/10 hover:text-[#A7C080] transition-all transform hover:scale-110 active:scale-95"><ArrowLeft size={28} /></button>
                <div className="space-y-1">
                  <input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="text-3xl font-black outline-none bg-transparent placeholder-gray-200 focus:text-[#A7C080] transition-colors" placeholder="제목 없는 기록 상자" />
                  <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.3em]">Moment Studio</p>
                </div>
              </div>
              <button onClick={saveVideoProject} className="bg-[#A7C080] text-white px-10 py-5 rounded-[28px] font-black shadow-xl shadow-[#A7C080]/20 flex items-center gap-3 hover:bg-[#8FA86A] transition-all hover:-translate-y-1 active:translate-y-0 active:scale-95"><Save size={22} /> <span className="text-lg text-white">상자에 보관</span></button>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-[#FDF8F5]">
               <div className="p-10 overflow-y-auto bg-white rounded-tr-[80px] shadow-inner space-y-10">
                  <div className="flex justify-between items-center bg-[#FDF8F5] p-8 rounded-[40px]">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight text-[#4B4453]">장면 구성</h3>
                      <p className="text-sm text-gray-400 font-medium">소중한 순간들을 영화처럼 배열해 보세요.</p>
                    </div>
                    <button onClick={generateAiCaptions} disabled={isGeneratingCaptions} className="flex items-center gap-3 px-8 py-5 bg-white text-[#A7C080] rounded-[24px] font-black transition-all hover:bg-[#A7C080] hover:text-white shadow-sm active:scale-95 disabled:opacity-50">
                      {isGeneratingCaptions ? <Loader2 size={22} className="animate-spin" /> : <Sparkles size={22} />}
                      <span className="text-base">AI 감성 자막</span>
                    </button>
                  </div>

                  <div className="space-y-8 pb-32">
                    {storyboard.map((item, index) => {
                      const photo = photos?.find(p => p.id === item.photoId);
                      return (
                        <motion.div layout key={index} className="bg-[#FDF8F5]/50 p-6 rounded-[48px] flex gap-8 relative group border-2 border-transparent hover:border-[#A7C080]/20 transition-all">
                          <div className="w-48 h-48 relative rounded-[40px] overflow-hidden shrink-0 shadow-2xl ring-[12px] ring-white">
                            <BlobImage blob={photo?.imageUrl} fill className="object-cover" alt="S" />
                          </div>
                          <div className="flex-1 space-y-5 pt-3">
                            <div className="flex justify-between items-center text-[10px] text-gray-300 font-black tracking-widest uppercase">
                              <span className="bg-white px-4 py-2 rounded-full text-[#A7C080] shadow-sm">SCENE {index + 1}</span>
                              <span className="flex items-center gap-2"><Clock size={12} /> {item.duration}s</span>
                            </div>
                            <textarea value={item.caption} onChange={e => { const n = [...storyboard]; n[index].caption = e.target.value; setStoryboard(n); }} className="w-full p-6 bg-white rounded-[32px] outline-none text-base h-32 resize-none border-2 border-transparent focus:border-[#A7C080]/30 shadow-sm font-medium" placeholder="이 장면에는 어떤 대화가 오갔나요?" />
                          </div>
                          <button onClick={() => setStoryboard(prev => prev.filter((_, i) => i !== index))} className="absolute -top-3 -right-3 p-4 bg-white text-gray-300 hover:text-red-400 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all border-2 border-[#FDF8F5] transform transition hover:scale-110"><Trash2 size={22} /></button>
                        </motion.div>
                      );
                    })}
                  </div>
               </div>

               <div className="p-16 flex flex-col items-center justify-center space-y-16 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#A7C080]/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
                 <div className="w-full aspect-video bg-[#4B4453] rounded-[80px] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.5)] flex items-center justify-center flex-col gap-10 relative cursor-pointer group overflow-hidden border-[16px] border-white/10 ring-1 ring-black/20">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-16 translate-y-6 group-hover:translate-y-0 transition-transform duration-500">
                      <div className="space-y-3">
                        <p className="text-3xl font-black text-white">{projectTitle || '우리의 소중한 기록'}</p>
                        <p className="text-white/50 text-lg font-medium italic">당신의 순간이 따뜻한 영화가 되는 과정</p>
                      </div>
                    </div>
                    <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} className="bg-white/20 p-16 rounded-full backdrop-blur-3xl border border-white/30 shadow-2xl relative z-10 text-white transform transition-all duration-500 hover:shadow-white/20">
                      <Play size={96} fill="currentColor" />
                    </motion.div>
                 </div>

                 <div className="w-full max-w-md grid grid-cols-2 gap-6 relative z-10 px-4">
                   {['Classic', 'Modern', 'Pop', 'Soft'].map(t => (
                     <button key={t} onClick={() => setSelectedTemplate(t.toLowerCase())} className={`py-6 rounded-[40px] font-black text-xl transition-all duration-300 ${selectedTemplate === t.toLowerCase() ? 'bg-[#A7C080] text-white shadow-2xl shadow-[#A7C080]/40 -translate-y-2' : 'bg-white text-gray-300 border-2 border-[#F3EDEA] hover:border-[#A7C080]/30 hover:text-[#A7C080]'}`}>
                       {t}
                     </button>
                   ))}
                 </div>
               </div>
            </main>
          </motion.div>
        )}

        {view === 'video-list' && (
          <motion.div key="video-list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex-1 flex flex-col p-12 max-w-6xl mx-auto w-full space-y-20">
            <div className="flex items-center gap-10">
              <button onClick={() => setView('dashboard')} className="p-8 bg-white rounded-[40px] shadow-sm hover:shadow-2xl transition-all hover:scale-105 border-2 border-[#FDF8F5] text-gray-400 hover:text-[#A7C080] active:scale-95"><ArrowLeft size={36} /></button>
              <div className="space-y-3">
                <h1 className="text-6xl font-black tracking-tighter text-[#4B4453]">{activeChild?.name}의 영화관</h1>
                <div className="flex items-center gap-6 text-gray-300 font-black uppercase tracking-widest text-[10px] bg-white px-6 py-3 rounded-full inline-flex shadow-sm">
                  <Play size={16} fill="currentColor" className="text-[#A7C080]" /> <span>총 {videoProjects.length}편의 기록 상영 중</span>
                </div>
              </div>
            </div>

            {videoProjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-200 gap-10 animate-pulse pb-40">
                <div className="w-80 h-80 bg-white/50 rounded-full flex items-center justify-center shadow-inner ring-[20px] ring-white/30"><Video size={120} strokeWidth={1} /></div>
                <div className="text-center space-y-4">
                  <p className="text-3xl font-black tracking-tight text-gray-300">상영관이 아직 조용하네요.</p>
                  <p className="text-gray-400 font-medium">소중한 사진들을 모아 첫 번째 영화를 만들어 보세요.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-10 pb-40">
                {videoProjects.map(project => (
                  <motion.div key={project.id} initial={{ x: -20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} className="bg-white p-12 rounded-[70px] shadow-sm flex items-center justify-between group hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 border-4 border-transparent hover:border-[#A7C080]/10">
                    <div className="flex items-center gap-12">
                      <div className="w-56 h-32 bg-[#4B4453] rounded-[48px] flex items-center justify-center text-white/20 overflow-hidden relative group-hover:scale-105 transition-transform duration-500 shadow-2xl">
                        <Play size={48} fill="currentColor" opacity={0.6} className="text-white relative z-10" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-[#A7C080]/30 to-transparent" />
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-3xl font-black group-hover:text-[#A7C080] transition-colors duration-300">{project.title}</h3>
                        <div className="flex items-center gap-8 text-[10px] text-gray-400 font-black uppercase tracking-widest bg-[#FDF8F5] px-6 py-3 rounded-full inline-flex border border-gray-100">
                          <span className="flex items-center gap-3"><Calendar size={14} className="text-[#8E8E8E]" /> {new Date(project.createdAt).toLocaleDateString()}</span>
                          <span className="flex items-center gap-3"><ImageIcon size={14} className="text-[#8E8E8E]" /> {project.scenes.length} Scenes</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <button onClick={() => deleteProject(project.id!)} className="p-6 text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-500"><Trash2 size={28} /></button>
                      <button onClick={() => { setEditingProjectId(project.id!); setProjectTitle(project.title); setStoryboard(project.scenes); setView('video-editor'); }} className="p-6 text-gray-200 hover:text-[#A7C080] transition-colors opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-500 delay-75"><Edit3 size={28} /></button>
                      <button className="bg-[#A7C080]/5 text-[#A7C080] px-12 py-7 rounded-[40px] font-black text-xl hover:bg-[#A7C080] hover:text-white transition-all shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 active:scale-95">상영 하기</button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view === 'profiles' && (
          <div className="fixed inset-0 bg-[#4B4453]/40 backdrop-blur-2xl z-[300] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-2xl p-16 rounded-[80px] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.4)] relative space-y-16">
              <button onClick={() => setView('dashboard')} className="absolute top-12 right-12 text-gray-300 hover:text-gray-600 transition-colors transform hover:rotate-90 duration-300"><X size={40} /></button>
              <div className="text-center space-y-6">
                <h2 className="text-5xl font-black tracking-tight text-[#4B4453]">아이의 상자들</h2>
                <p className="text-lg text-gray-400 font-medium">어떤 아이의 소중한 기록을 확인해볼까요?</p>
              </div>
              <div className="grid grid-cols-2 gap-8">
                {children?.map(child => (
                   <button key={child.id} onClick={() => { setActiveChildId(child.id!); setView('dashboard'); }} className={`flex flex-col items-center gap-8 p-12 rounded-[60px] border-4 transition-all duration-500 ${activeChildId === child.id ? 'border-[#A7C080] bg-[#A7C080]/5 shadow-2xl scale-105' : 'border-[#FDF8F5] hover:border-[#A7C080]/20 hover:bg-[#FDF8F5]/30'}`}>
                     <div className="w-32 h-32 bg-white rounded-[40px] flex items-center justify-center shadow-xl overflow-hidden relative ring-[12px] ring-white">
                       {child.profileImageUrl ? <BlobImage blob={child.profileImageUrl} fill className="object-cover" alt="C" /> : <Baby size={54} className="text-[#A7C080] opacity-40" />}
                     </div>
                     <span className="font-black text-2xl text-[#4B4453]">{child.name}</span>
                   </button>
                ))}
                <button onClick={() => { setView('onboarding'); }} className="flex flex-col items-center justify-center gap-8 p-12 rounded-[60px] border-4 border-dashed border-[#F3EDEA] text-gray-300 hover:border-[#A7C080]/30 hover:text-[#A7C080] transition-all bg-[#FDF8F5]/50 group">
                  <div className="w-32 h-32 rounded-[40px] flex items-center justify-center bg-white shadow-inner group-hover:scale-110 transition-transform duration-300"><Plus size={48} /></div>
                  <span className="font-black text-2xl uppercase tracking-widest">새 상자</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddProfileModal && (
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-md p-10 rounded-[50px] shadow-2xl">
              <div className="flex justify-between items-center mb-10"><h3 className="text-2xl font-black">프로필 만들기</h3><button onClick={() => setShowAddProfileModal(false)}><X size={24} /></button></div>
              <form onSubmit={handleAddChild} className="space-y-6">
                <div><label className="text-[10px] text-gray-400 font-bold ml-2">Name</label><input type="text" required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold" /></div>
                <div><label className="text-[10px] text-gray-400 font-bold ml-2">Birthday</label><input type="date" required value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold" /></div>
                <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowAddProfileModal(false)} className="flex-1 py-5 text-gray-400 font-bold">취소</button><button type="submit" className="flex-1 py-5 bg-[#A7C080] text-white rounded-[24px] font-black shadow-lg">생성</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {isEditPhotoModalOpen && editingPhoto && (
          <div className="fixed inset-0 bg-[#4B4453]/60 backdrop-blur-md z-[150] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-4xl p-10 rounded-[60px] flex shadow-2xl gap-12 relative overflow-hidden">
              <button onClick={() => setIsEditPhotoModalOpen(false)} className="absolute top-8 right-8 text-gray-300"><X size={32} /></button>
              <div className="w-[45%] aspect-square relative rounded-[40px] overflow-hidden shadow-2xl border-2 border-gray-50"><BlobImage blob={editingPhoto.imageUrl} fill className="object-cover" alt="Editor" /></div>
              <div className="flex-1 flex flex-col justify-center space-y-8">
                <div><h3 className="text-3xl font-black mb-2">기록 수정</h3><p className="text-gray-400 font-bold">아이의 추억을 더 정확하게 기록해 주세요.</p></div>
                <div className="space-y-6">
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Date Taken</label><input type="date" value={editTakenAt} onChange={e => setEditTakenAt(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold shadow-inner" /></div>
                   <div><label className="text-[10px] text-gray-400 font-black uppercase tracking-widest ml-2">Category</label><select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] font-bold border-r-8 border-transparent"><option value="영아기">영아기</option><option value="유아기">유아기</option><option value="아동기">아동기</option><option value="기타">기타</option></select></div>
                   <div><label className="text-[10px] text-gray-400 font-black uppercase tracking-widest ml-2">Memory Caption</label><textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} className="w-full p-6 bg-gray-50 rounded-[32px] h-40 outline-none resize-none" placeholder="따뜻한 메모를 남겨주세요." /></div>
                </div>
                <div className="flex gap-6 pt-4"><button onClick={() => handleDeletePhoto(editingPhoto.id!)} className="p-5 text-gray-200 hover:text-red-400 transition-all"><Trash2 size={24} /></button><button onClick={handleUpdatePhoto} className="flex-1 py-6 bg-[#A7C080] text-white rounded-[24px] font-black shadow-xl transition-all">저장</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
