"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Baby, Plus, Trash2, X, Camera, Loader2, AlertCircle, Check, Video, Upload, Calendar, Clock, Image as ImageIcon, Save, Play, Edit3, List, ArrowLeft, Sparkles, Layout, LogOut, User as UserIcon
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
    return <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-300"><ImageIcon size={24} /></div>;
  }
  return <Image src={url} alt={alt || "이미지"} onError={() => setHasError(true)} {...props} />;
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
        
        // Metadata contains mimeType which is used for contentType in storage
        await firebaseService.uploadPhoto(user.uid, file, { 
          childIds: uploadChildIds, 
          fileName: file.name, 
          fileSize: file.size, 
          mimeType: file.type || 'image/jpeg', 
          takenAt, 
          ageInMonths, 
          category 
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
    }
  };

  const togglePhotoSelection = (id: string) => setSelectedPhotoIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  const handleEditPhoto = (p: Photo) => { setEditingPhoto(p); setEditCaption(p.caption || ''); setEditCategory(p.category || ''); setEditTakenAt(new Date(p.takenAt).toISOString().split('T')[0]); setIsEditPhotoModalOpen(true); };
  const startNewVideoProject = () => { if (selectedPhotoIds.length === 0) return; setProjectTitle(`${activeChild?.name}의 보물 영상 (${new Date().toLocaleDateString()})`); setStoryboard(selectedPhotoIds.map(id => ({ photoId: id, caption: '', duration: 3 }))); setEditingProjectId(null); setView('video-editor'); };
  const handleDeletePhoto = async (id: string) => { if (!user || !confirm('삭제하시겠습니까?')) return; const photo = photos?.find(p => p.id === id); if (!photo) return; try { await firebaseService.deletePhoto(user.uid, id, photo.storagePath); setSelectedPhotoIds(prev => prev.filter(pid => pid !== id)); } catch (err: any) { setError('삭제 실패'); } };

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
        const response = await fetch(photo.imageUrl);
        const imageBlob = await response.blob();
        const base64 = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve((reader.result as string).split(',')[1]); reader.readAsDataURL(imageBlob); });
        return [{ text: `사진 ${index + 1} (아이 연령: ${formatAge(photo.ageInMonths)}):` }, { inlineData: { data: base64, mimeType: photo.mimeType } }];
      }));
      const res = await ai.models.generateContent({ model: "gemini-3-flash-preview", config: { responseMimeType: "application/json" }, contents: [{ parts: [{ text: `아이 이름: ${activeChild.name}` }, ...photoParts.flat()] }] });
      const captions = JSON.parse(res.text || "[]");
      if (Array.isArray(captions)) setStoryboard(prev => prev.map((item, index) => ({ ...item, caption: captions[index] || item.caption })));
    } catch (err) { setError("AI 자막 생성 실패"); } finally { setIsGeneratingCaptions(false); }
  };

  // --- Views ---

  const LoginView = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF8F5] p-6 relative z-10 overflow-hidden">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-10 relative z-20">
        <div className="w-24 h-24 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto marker:bg-none"><Baby size={48} fill="currentColor" /></div>
        <div><h1 className="text-4xl font-black text-[#4B4453] mb-4 tracking-tight">성장 기록함</h1><p className="text-[#8E8E8E] leading-relaxed">자녀의 소중한 모든 순간을<br />클라우드에 안전하게 보관하세요.</p></div>
        <div className="relative z-30">
          <div className="space-y-4">
            {isLoading && <div className="flex justify-center flex-col items-center gap-4 py-4 animate-pulse"><Loader2 className="animate-spin text-[#A7C080]" size={32} /><p className="text-xs text-gray-400 font-black">인증 처리 중...</p></div>}
            <button type="button" onClick={handleLogin} disabled={false} className="w-full relative z-[100] flex items-center justify-center gap-4 bg-white border-2 border-[#E5E5E5] hover:border-[#A7C080] py-5 rounded-3xl font-black text-[#4B4453] transition-all group active:scale-95 shadow-sm hover:shadow-xl"><Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={24} height={24} alt="G" /><span className="text-xl">상자 열기</span></button>
          </div>
        </div>
        <p className="text-[11px] text-[#BDBDBD]">구글 로그인 시 실시간 데이터가 동기화됩니다.</p>
      </motion.div>
    </div>
  );

  if (!mounted || authLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDF8F5]"><Baby size={48} className="text-[#A7C080] animate-bounce" /><p className="mt-4 text-[#8E8E8E] font-black uppercase tracking-widest text-xs">보물상자 준비 중...</p></div>;
  if (!user) return <LoginView />;

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF8F5] text-[#4B4453]">
      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-white border-2 border-red-100 text-red-500 px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4"><AlertCircle size={20} /><span>{error}</span><button onClick={() => setError(null)}><X size={20} /></button></motion.div>}</AnimatePresence>
      <AnimatePresence>{isUploading && <div className="fixed inset-0 z-[100] bg-[#4B4453]/60 backdrop-blur-md flex items-center justify-center p-6"><div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center space-y-6"><div className="relative w-24 h-24 mx-auto"><svg className="w-full h-full" viewBox="0 0 100 100"><circle className="text-[#FDF8F5] stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" /><motion.circle className="text-[#A7C080] stroke-current" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" animate={{ strokeDashoffset: 251.2 - (251.2 * (uploadProgress.current / uploadProgress.total)) }}/></svg><div className="absolute inset-0 flex items-center justify-center font-black text-[#A7C080] text-xl">{Math.round((uploadProgress.current/uploadProgress.total)*100)}%</div></div><p className="text-[#8E8E8E] text-sm">클라우드 동기화 {uploadProgress.current} / {uploadProgress.total}</p></div></div>}</AnimatePresence>
      <AnimatePresence>{isUploadModalOpen && <div className="fixed inset-0 bg-[#4B4453]/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6"><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl"><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">기록 추가하기</h2><button onClick={() => setIsUploadModalOpen(false)}><X size={24} /></button></div><div className="space-y-3 mb-8">{children?.map(child => <label key={child.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${uploadChildIds.includes(child.id!) ? 'border-[#A7C080] bg-[#A7C080]/5' : 'border-[#FDF8F5] bg-[#FDF8F5]'}`}><input type="checkbox" className="hidden" checked={uploadChildIds.includes(child.id!)} onChange={() => setUploadChildIds(prev => prev.includes(child.id!) ? prev.filter(id => id !== child.id) : [...prev, child.id!])} /><div className="w-10 h-10 bg-[#A7C080] rounded-xl flex items-center justify-center text-white font-bold">{child.name[0]}</div><span className="font-bold flex-1">{child.name}</span>{uploadChildIds.includes(child.id!) && <Check size={20} className="text-[#A7C080]" />}</label>)}</div><button onClick={startUpload} className="w-full py-5 bg-[#A7C080] text-white rounded-[24px] font-bold">업로드 시작</button></motion.div></div>}</AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'onboarding' && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center p-6 relative z-10">
            <div className="max-w-md w-full bg-white p-12 rounded-[50px] shadow-2xl text-center space-y-8 relative z-20 pointer-events-auto">
               <div className="w-20 h-20 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto"><Baby size={40} fill="currentColor" /></div>
               <div><h2 className="text-2xl font-black">{user.displayName}님, 환영합니다!</h2><p className="text-gray-400 mt-2 font-bold">아이의 첫 번째 프로필을 만들어 상자를 열어보세요.</p></div>
               <form onSubmit={handleAddChild} className="space-y-6 relative z-30 pointer-events-auto">
                 <div className="space-y-2 text-left"><label className="text-[10px] text-gray-400 font-black ml-2 uppercase">아이 이름</label><input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/20" placeholder="이름" /></div>
                 <div className="space-y-2 text-left"><label className="text-[10px] text-gray-400 font-black ml-2 uppercase">생년월일</label><input required type="date" value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-[#A7C080]/20" /></div>
                 <button type="submit" disabled={isLoading} className="w-full relative z-[50] bg-[#A7C080] text-white py-5 rounded-[28px] font-black shadow-lg flex items-center justify-center gap-3 disabled:opacity-70">{isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}<span>상자 열기</span></button>
               </form>
            </div>
          </motion.div>
        )}

        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">
            <header className="bg-white border-b border-[#A7C080]/10 sticky top-0 z-30 p-4 shadow-sm backdrop-blur-md bg-white/80">
              <div className="max-w-7xl mx-auto flex justify-between items-center">
                <button onClick={() => setView('profiles')} className="flex items-center gap-4 bg-[#FDF8F5] p-2 pr-6 rounded-2xl border border-[#A7C080]/10 hover:shadow-md transition-all">
                  <div className="w-10 h-10 bg-[#A7C080] rounded-xl flex items-center justify-center text-white overflow-hidden relative">{activeChild?.profileImageUrl ? <BlobImage blob={activeChild.profileImageUrl} fill className="object-cover" alt="P" /> : <Baby size={20} />}</div>
                  <div className="text-left"><h2 className="text-sm font-black">{activeChild?.name}</h2><p className="text-[10px] text-gray-400">성장 기록함</p></div>
                </button>
                <div className="flex items-center gap-4">
                  <div className="sm:flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100 hidden">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm relative flex items-center justify-center bg-gray-100">
                      {/* [IMPROVED] 구글 프로필 이미지 Fallback 및 unoptimized 적용 */}
                      {user.photoURL && !profileImgError ? (
                        <Image 
                          src={user.photoURL} 
                          width={32} 
                          height={32} 
                          alt="U" 
                          unoptimized
                          className="w-full h-full object-cover"
                          onError={() => setProfileImgError(true)}
                        />
                      ) : (
                        <UserIcon size={16} className="text-gray-400" />
                      )}
                    </div>
                    <span className="text-sm font-bold truncate max-w-[100px]">{user.displayName}</span>
                    <button onClick={handleLogout} className="text-gray-300 hover:text-red-400"><LogOut size={16} /></button>
                  </div>
                  <button onClick={() => setView('video-list')} className="p-3 bg-[#FDF8F5] text-[#8E8E8E] rounded-2xl"><List size={20} /></button>
                  {/* [IMPROVED] 업로드 상태 피드백 강화 */}
                  <label className="flex items-center gap-2 px-6 py-3 bg-[#A7C080] text-white rounded-2xl font-bold cursor-pointer hover:bg-[#8FA86A] shadow-md transition-all">
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    <span>{isUploading ? '기록 중...' : '기록하기'}</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} disabled={isUploading}/>
                  </label>
                </div>
              </div>
            </header>
            <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
              {photos === undefined ? (
                <div className="h-[60vh] flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-[#A7C080]" size={48} /><p className="text-gray-400 font-bold">도착 확인 중...</p></div>
              ) : photos.length === 0 ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6 opacity-40"><div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center"><Camera size={48} className="text-gray-400" /></div><div><h1 className="text-2xl font-bold">비어 있는 상자</h1><p className="text-[#8E8E8E] mt-2">아이의 소중한 순간을 채워주세요.</p></div></div>
              ) : (
                <div className="space-y-20 pb-40">
                  {groupedPhotos?.map((group) => (
                    <section key={group.monthYear} className="space-y-8">
                      <div className="flex items-center gap-4"><h3 className="text-xl font-black text-[#A7C080]">{group.monthYear}</h3><div className="h-px bg-[#A7C080]/10 flex-1" /></div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {group.items.map((photo) => (
                          <motion.div key={photo.id} onClick={() => togglePhotoSelection(photo.id!)} className={`group relative aspect-square bg-white rounded-[32px] overflow-hidden border-4 shadow-sm transition-all cursor-pointer ${selectedPhotoIds.includes(photo.id!) ? 'border-[#A7C080] scale-95' : 'border-transparent'}`}>
                            <BlobImage blob={photo.imageUrl} fill className="object-cover" alt="Art" />
                            {selectedPhotoIds.includes(photo.id!) && <div className="absolute inset-0 bg-[#A7C080]/30 backdrop-blur-[1px] flex items-center justify-center"><div className="bg-white p-2 rounded-full text-[#A7C080] shadow-xl"><Check size={24} strokeWidth={4} /></div></div>}
                            <div className="absolute top-2 left-2 px-3 py-1 bg-white/80 backdrop-blur-md rounded-xl text-[10px] font-black text-[#A7C080] shadow-sm">{formatAge(photo.ageInMonths)}</div>
                            <button onClick={(e) => { e.stopPropagation(); handleEditPhoto(photo); }} className="absolute bottom-2 right-2 p-2 bg-black/20 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all"><Edit3 size={14} /></button>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </main>
            <AnimatePresence>{selectedPhotoIds.length > 0 && <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-[#4B4453] text-white p-5 rounded-[40px] shadow-2xl flex items-center justify-between border border-white/10 backdrop-blur-xl w-full max-w-sm"><span className="font-bold ml-4">{selectedPhotoIds.length}개 선택</span><div className="flex gap-4"><button onClick={() => setSelectedPhotoIds([])} className="text-sm text-gray-400 px-2">해제</button><button onClick={startNewVideoProject} className="bg-[#A7C080] px-6 py-4 rounded-[28px] font-black flex items-center gap-2"><Video size={20} /> 영상 제작</button></div></motion.div>}</AnimatePresence>
          </motion.div>
        )}

        {view === 'video-editor' && (
          <motion.div key="video-editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col bg-white">
            <header className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-40"><div className="flex items-center gap-6"><button onClick={() => setView('dashboard')} className="p-3 bg-gray-50 rounded-2xl"><ArrowLeft size={24} /></button><input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="text-2xl font-black outline-none border-b-4 border-transparent focus:border-[#A7C080]" /></div><button onClick={saveVideoProject} className="bg-[#A7C080] text-white px-8 py-4 rounded-[24px] font-black shadow-lg flex items-center gap-2"><Save size={20} /> 저장</button></header>
            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
               <div className="p-10 overflow-y-auto space-y-6 border-r border-gray-50"><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-black">장면 구성</h3><button onClick={generateAiCaptions} disabled={isGeneratingCaptions} className="flex items-center gap-2 px-6 py-3 bg-[#A7C080]/10 text-[#A7C080] rounded-2xl font-bold transition-all">{isGeneratingCaptions ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} AI 자막</button></div>
                  <div className="space-y-4 pb-20">{storyboard.map((item, index) => { const photo = photos?.find(p => p.id === item.photoId); return <motion.div layout key={index} className="bg-gray-50 p-5 rounded-[32px] flex gap-6 relative group border border-gray-100"><div className="w-32 h-32 relative rounded-3xl overflow-hidden shrink-0"><BlobImage blob={photo?.imageUrl} fill className="object-cover" alt="S" /></div><div className="flex-1 space-y-3 pt-1"><div className="flex justify-between items-center text-[10px] text-gray-400 font-black tracking-widest"><span>SCENE {index + 1}</span><span>{item.duration}s</span></div><textarea value={item.caption} onChange={e => { const n = [...storyboard]; n[index].caption = e.target.value; setStoryboard(n); }} className="w-full p-4 bg-white rounded-2xl outline-none text-sm h-28 resize-none border border-transparent focus:border-[#A7C080]/30 shadow-sm" placeholder="따뜻한 자막을 남겨주세요." /></div><button onClick={() => setStoryboard(prev => prev.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 p-2 bg-white text-gray-200 hover:text-red-400 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all border border-gray-100"><Trash2 size={16} /></button></motion.div>; })}</div>
               </div>
               <div className="bg-[#4B4453] p-12 flex flex-col items-center justify-center text-white space-y-10 relative overflow-hidden"><div className="w-full aspect-video bg-black/40 rounded-[40px] shadow-2xl flex items-center justify-center flex-col gap-4 border border-white/5 relative cursor-pointer overflow-hidden"><div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8"><p className="text-xl font-bold opacity-80 italic">미리보기 준비 중</p></div><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 4 }} className="bg-white/10 p-10 rounded-full backdrop-blur-md"><Play size={64} fill="currentColor" /></motion.div></div><div className="w-full max-w-sm grid grid-cols-2 gap-4">{['Classic', 'Modern', 'Pop', 'Soft'].map(t => <button key={t} onClick={() => setSelectedTemplate(t.toLowerCase())} className={`py-6 rounded-3xl font-black transition-all ${selectedTemplate === t.toLowerCase() ? 'bg-[#A7C080] text-[#4B4453]' : 'bg-white/5 border border-white/10'}`}>{t}</button>)}</div></div>
            </main>
          </motion.div>
        )}

        {view === 'video-list' && (
          <motion.div key="video-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col p-10 max-w-5xl mx-auto w-full space-y-12">
            <div className="flex items-center gap-6"><button onClick={() => setView('dashboard')} className="p-4 bg-white rounded-3xl shadow-sm"><ArrowLeft size={24} /></button><h1 className="text-4xl font-black tracking-tight">{activeChild?.name}의 보물 영상</h1></div>
            {videoProjects.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-4 opacity-50"><Video size={80} /><p className="font-bold">기록된 비디오가 없습니다.</p></div> : (
              <div className="grid gap-6">{videoProjects.map(project => (
                  <motion.div key={project.id} whileHover={{ x: 10 }} className="bg-white p-8 rounded-[48px] shadow-sm flex items-center justify-between group hover:shadow-xl transition-all border border-gray-50">
                    <div className="flex items-center gap-10"><div className="w-20 h-20 bg-[#FDF8F5] rounded-[30px] flex items-center justify-center text-[#A7C080] shadow-inner"><Video size={40} /></div><div><h3 className="text-2xl font-black mb-1">{project.title}</h3><div className="flex gap-4 text-sm text-gray-300 font-bold"><span><Calendar size={14} /> {new Date(project.createdAt).toLocaleDateString()}</span><span><ImageIcon size={14} /> {project.scenes.length} Scenes</span></div></div></div>
                    <div className="flex gap-4"><button onClick={() => { setEditingProjectId(project.id!); setProjectTitle(project.title); setStoryboard(project.scenes); setView('video-editor'); }} className="p-5 bg-[#FDF8F5] text-[#A7C080] rounded-[24px] hover:bg-[#A7C080] hover:text-white transition-all"><Edit3 size={24} /></button><button onClick={() => deleteProject(project.id!)} className="p-5 text-gray-100 hover:text-red-400 transition-all"><Trash2 size={24} /></button></div>
                  </motion.div>
              ))}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view === 'profiles' && (
          <div className="fixed inset-0 bg-[#4B4453]/60 backdrop-blur-xl z-[150] flex items-center justify-center p-6">
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg p-12 rounded-[60px] shadow-2xl relative">
                <button onClick={() => setView('dashboard')} className="absolute top-8 right-8 text-gray-300 hover:text-[#4B4453]"><X size={32} /></button>
                <div className="mb-12"><h2 className="text-3xl font-black mb-2">누구의 상자를 열까요?</h2><p className="text-gray-400 font-bold">아이들의 소중한 기록을 선택해 보세요.</p></div>
                <div className="grid grid-cols-2 gap-6 mb-12">{children?.map(child => (
                    <motion.div key={child.id} layout whileHover={{ scale: 1.05 }} onClick={() => { setActiveChildId(child.id!); setView('dashboard'); }} className={`relative p-8 rounded-[40px] border-4 cursor-pointer text-center transition-all ${activeChildId === child.id ? 'border-[#A7C080] bg-[#A7C080]/5' : 'border-gray-50 bg-gray-50'}`}><div className="w-20 h-20 bg-[#A7C080] rounded-[30px] flex items-center justify-center text-white text-3xl font-black mx-auto mb-4">{child.name[0]}</div><span className="font-black text-xl">{child.name}</span><button onClick={(e) => { e.stopPropagation(); handleDeleteChild(child.id!); }} className="absolute -top-3 -right-3 p-3 bg-white text-gray-200 hover:text-red-400 rounded-full shadow-lg opacity-0"><Trash2 size={20} /></button></motion.div>
                  ))}<button onClick={() => setShowAddProfileModal(true)} className="flex flex-col items-center justify-center p-8 rounded-[40px] border-4 border-dashed border-gray-100 text-gray-300 hover:border-[#A7C080] hover:text-[#A7C080] transition-all gap-4"><div className="p-4 bg-gray-50 rounded-full"><Plus size={32} /></div><span className="font-bold">추가</span></button></div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>{showAddProfileModal && (
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
      )}</AnimatePresence>
      
      <AnimatePresence>{isEditPhotoModalOpen && editingPhoto && (
          <div className="fixed inset-0 bg-[#4B4453]/60 backdrop-blur-md z-[150] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-4xl p-10 rounded-[60px] flex shadow-2xl gap-12 relative overflow-hidden">
              <button onClick={() => setIsEditPhotoModalOpen(false)} className="absolute top-8 right-8 text-gray-300"><X size={32} /></button>
              <div className="w-[45%] aspect-square relative rounded-[40px] overflow-hidden shadow-2xl border-2 border-gray-50"><BlobImage blob={editingPhoto.imageUrl} fill className="object-cover" alt="Editor" /></div>
              <div className="flex-1 flex flex-col justify-center space-y-8">
                <div><h3 className="text-3xl font-black mb-2">기록 수정</h3><p className="text-gray-400 font-bold">아이의 추억을 더 정확하게 기록해 주세요.</p></div>
                <div className="space-y-6">
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Date Taken</label><input type="date" value={editTakenAt} onChange={e => setEditTakenAt(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] outline-none font-bold shadow-inner" /></div>
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Category</label><select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full p-5 bg-gray-50 rounded-[24px] font-bold border-r-8 border-transparent"><option value="영아기">영아기</option><option value="유아기">유아기</option><option value="아동기">아동기</option><option value="기타">기타</option></select></div>
                   <div><label className="text-[10px] text-gray-400 font-bold ml-2 uppercase">Memory Caption</label><textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} className="w-full p-6 bg-gray-50 rounded-[32px] h-40 outline-none resize-none" placeholder="따뜻한 메모를 남겨주세요." /></div>
                </div>
                <div className="flex gap-6 pt-4"><button onClick={() => handleDeletePhoto(editingPhoto.id!)} className="p-5 text-gray-200 hover:text-red-400 transition-all"><Trash2 size={24} /></button><button onClick={handleUpdatePhoto} className="flex-1 py-6 bg-[#A7C080] text-white rounded-[24px] font-black shadow-xl transition-all">저장</button></div>
              </div>
            </motion.div>
          </div>
      )}</AnimatePresence>
    </div>
  );
}
