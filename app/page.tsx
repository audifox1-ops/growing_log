'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Baby, Plus, Trash2, Users, ChevronRight, X, Camera, Loader2, AlertCircle, Check, Video, Upload, Calendar, Clock, Image as ImageIcon, ChevronUp, ChevronDown, Save, Play, Music, Edit3, List, ArrowLeft, Sparkles
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import exifr from 'exifr';
import { GoogleGenAI, Type } from "@google/genai";
import { db, type Child, type Photo, type VideoProject } from '@/lib/db';
import { useChildStore } from '@/lib/store';
import { calculateAgeInMonths, formatAge } from '@/lib/utils';

/**
 * Main Application Component
 * Implements Multi-Child Profile Management, Smart Photo Upload, Timeline, and Video Engine.
 */
export default function App() {
  // --- Global State (Zustand) ---
  const { activeChildId, setActiveChildId } = useChildStore();

  // --- Local DB Data (Dexie) ---
  const children = useLiveQuery(() => db.children.toArray());
  
  // Fetch photos for the active child, sorted by takenAt (newest first)
  const photos = useLiveQuery(
    async () => {
      if (!activeChildId) return [];
      const data = await db.photos.where('childId').equals(activeChildId).toArray();
      return data.sort((a, b) => b.takenAt - a.takenAt);
    },
    [activeChildId]
  );

  // Group photos by month for the timeline
  const groupedPhotos = useMemo(() => {
    if (!photos) return null;
    const groups: { monthYear: string; items: Photo[] }[] = [];
    const monthMap: { [key: string]: Photo[] } = {};

    photos.forEach(photo => {
      const date = new Date(photo.takenAt);
      const monthYear = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
      if (!monthMap[monthYear]) {
        monthMap[monthYear] = [];
        groups.push({ monthYear, items: monthMap[monthYear] });
      }
      monthMap[monthYear].push(photo);
    });

    return groups;
  }, [photos]);

  // Fetch video projects for the active child
  const videoProjects = useLiveQuery(
    () => activeChildId ? db.videoProjects.where('childId').equals(activeChildId).reverse().sortBy('updatedAt') : [],
    [activeChildId]
  );
  
  const activeChild = useMemo(() => 
    children?.find(c => c.id === activeChildId) || null, 
    [children, activeChildId]
  );

  // --- UI State ---
  const [view, setView] = useState<'loading' | 'onboarding' | 'dashboard' | 'profiles' | 'video-editor' | 'video-list'>('loading');
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // --- Video Editor State ---
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [storyboard, setStoryboard] = useState<{ photoId: number; caption: string; duration: number }[]>([]);
  const [selectedBgm, setSelectedBgm] = useState('BGM_1');

  // Form State for adding a new child
  const [newName, setNewName] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  const [newProfileImage, setNewProfileImage] = useState<Blob | null>(null);

  // --- Initialization ---
  useEffect(() => {
    if (children !== undefined) {
      if (children.length === 0) {
        setView('onboarding');
      } else {
        if (!activeChildId || !children.some(c => c.id === activeChildId)) {
          setActiveChildId(children[0].id!);
        }
        if (view === 'loading') setView('dashboard');
      }
    }
  }, [children, activeChildId, setActiveChildId, view]);

  // --- Handlers ---

  /**
   * Adds a new child profile.
   */
  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (!newName || !newBirthDate) throw new Error('이름과 생일을 입력해 주세요.');
      
      const id = await db.children.add({
        name: newName,
        birthDate: newBirthDate,
        profileImage: newProfileImage || undefined,
        createdAt: Date.now()
      });
      
      setActiveChildId(id);
      setNewName('');
      setNewBirthDate('');
      setNewProfileImage(null);
      setShowAddProfileModal(false);
      if (view === 'onboarding') setView('dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  /**
   * Deletes a child profile.
   */
  const handleDeleteChild = async (id: number) => {
    if (!confirm('이 자녀의 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    try {
      await db.transaction('rw', [db.children, db.photos, db.videoProjects], async () => {
        await db.photos.where('childId').equals(id).delete();
        await db.videoProjects.where('childId').equals(id).delete();
        await db.children.delete(id);
      });
      if (activeChildId === id) {
        const remaining = children?.filter(c => c.id !== id);
        if (remaining && remaining.length > 0) {
          setActiveChildId(remaining[0].id!);
        } else {
          setActiveChildId(null);
          setView('onboarding');
        }
      }
    } catch (err) {
      setError('자녀 프로필 삭제 실패');
    }
  };

  /**
   * Handles multiple photo uploads with EXIF extraction and age calculation.
   */
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!activeChildId || !activeChild) {
      setError('자녀를 먼저 선택해 주세요.');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setError(null);

    try {
      const photoEntries: Photo[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        let takenAt: number;
        try {
          const exif = await exifr.parse(file);
          if (exif && exif.DateTimeOriginal) {
            takenAt = new Date(exif.DateTimeOriginal).getTime();
          } else {
            takenAt = file.lastModified;
          }
        } catch (exifErr) {
          takenAt = file.lastModified;
        }

        const ageInMonths = calculateAgeInMonths(activeChild.birthDate, takenAt);

        let category = '기타';
        if (ageInMonths < 12) category = '영아기';
        else if (ageInMonths < 36) category = '유아기';
        else category = '아동기';

        photoEntries.push({
          childId: activeChildId,
          blob: file,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          takenAt,
          ageInMonths,
          category,
          createdAt: Date.now()
        });

        setUploadProgress(prev => ({ ...prev, current: i + 1 }));
      }

      await db.photos.bulkAdd(photoEntries);
      
    } catch (err: any) {
      console.error('Upload Error:', err);
      setError('사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  /**
   * Deletes a specific photo.
   */
  const handleDeletePhoto = async (id: number) => {
    if (!confirm('이 사진을 삭제하시겠습니까?')) return;
    try {
      await db.photos.delete(id);
      setSelectedPhotoIds(prev => prev.filter(pid => pid !== id));
    } catch (err) {
      setError('사진 삭제 실패');
    }
  };

  // --- Video Engine Handlers ---

  const togglePhotoSelection = (id: number) => {
    setSelectedPhotoIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const startNewVideoProject = () => {
    if (selectedPhotoIds.length === 0) {
      setError('영상에 포함할 사진을 먼저 선택해 주세요.');
      return;
    }
    
    const initialStoryboard = selectedPhotoIds.map(id => ({
      photoId: id,
      caption: '',
      duration: 3
    }));

    setStoryboard(initialStoryboard);
    setProjectTitle(`${activeChild?.name}의 성장 기록`);
    setEditingProjectId(null);
    setSelectedBgm('BGM_1');
    setView('video-editor');
  };

  const moveStoryboardItem = (index: number, direction: 'up' | 'down') => {
    const newStoryboard = [...storyboard];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newStoryboard.length) return;
    
    [newStoryboard[index], newStoryboard[targetIndex]] = [newStoryboard[targetIndex], newStoryboard[index]];
    setStoryboard(newStoryboard);
  };

  const updateCaption = (index: number, caption: string) => {
    const newStoryboard = [...storyboard];
    newStoryboard[index].caption = caption;
    setStoryboard(newStoryboard);
  };

  const saveVideoProject = async () => {
    if (!activeChildId) return;
    if (!projectTitle.trim()) {
      setError('프로젝트 제목을 입력해 주세요.');
      return;
    }

    try {
      const projectData: VideoProject = {
        childId: activeChildId,
        title: projectTitle,
        scenes: storyboard,
        musicId: selectedBgm,
        status: 'draft',
        createdAt: editingProjectId ? (await db.videoProjects.get(editingProjectId))?.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now()
      };

      if (editingProjectId) {
        // Fix for TypeScript error: use put with ID for updates to avoid UpdateSpec issues
        await db.videoProjects.put({ ...projectData, id: editingProjectId });
      } else {
        await db.videoProjects.add(projectData);
      }

      setView('video-list');
      setSelectedPhotoIds([]);
    } catch (err) {
      setError('프로젝트 저장 실패');
    }
  };

  const loadProject = (project: VideoProject) => {
    setEditingProjectId(project.id!);
    setProjectTitle(project.title);
    setStoryboard(project.scenes);
    setSelectedBgm(project.musicId || 'BGM_1');
    setView('video-editor');
  };

  const deleteProject = async (id: number) => {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;
    try {
      await db.videoProjects.delete(id);
    } catch (err) {
      setError('프로젝트 삭제 실패');
    }
  };

  const generateAiCaptions = async () => {
    if (!storyboard.length || !activeChild) return;
    
    setIsGeneratingCaptions(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      // Prepare parts for the prompt
      const photoParts = await Promise.all(storyboard.map(async (item, index) => {
        const photo = photos?.find(p => p.id === item.photoId);
        if (!photo) return [{ text: `사진 ${index + 1}: [이미지 데이터 없음]` }];
        
        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(photo.blob);
        const base64 = await base64Promise;

        return [
          { text: `사진 ${index + 1} (아이 나이: ${formatAge(photo.ageInMonths)}):` },
          {
            inlineData: {
              data: base64,
              mimeType: photo.mimeType
            }
          }
        ];
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `당신은 아이의 성장을 기록하는 감성적인 작가입니다. 
          제공된 사진들과 아이의 나이(개월 수)를 바탕으로, 각 사진에 어울리는 짧고 감동적인 자막을 한국어로 작성해 주세요.
          자막은 아이의 시점이나 부모의 시점에서 따뜻하게 작성되어야 합니다.
          각 사진에 대해 하나의 문장으로 작성해 주세요.
          응답은 반드시 사진 순서에 맞는 자막 문자열들의 JSON 배열이어야 합니다.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              description: "사진에 대한 감성적인 자막"
            }
          }
        },
        contents: [
          {
            parts: [
              { text: `아이 이름: ${activeChild.name}. 다음은 시간 순서대로 나열된 사진들입니다. 각 사진의 분위기와 아이의 연령을 고려하여 자막을 생성해 주세요.` },
              ...photoParts.flat(),
              { text: "모든 사진에 대한 자막을 순서대로 생성해 주세요." }
            ]
          }
        ]
      });

      const responseText = response.text;
      
      try {
        if (!responseText) {
          throw new Error("AI 응답이 비어 있습니다.");
        }
        const captions = JSON.parse(responseText);
        
        if (Array.isArray(captions)) {
          setStoryboard(prev => prev.map((item, index) => ({
            ...item,
            caption: captions[index] || item.caption
          })));
        }
      } catch (parseErr) {
        console.error("Failed to parse AI response:", responseText);
        setError("AI 자막 생성 결과 해석에 실패했습니다.");
      }
    } catch (err) {
      console.error("AI Generation Error:", err);
      setError("AI 자막 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // --- Render Helpers ---

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF8F5]">
        <Loader2 className="animate-spin text-[#A7C080]" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FDF8F5] text-[#4B4453] font-sans">
      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-600 px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3"
          >
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 font-bold">&times;</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Progress Overlay */}
      <AnimatePresence>
        {isUploading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#4B4453]/60 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center space-y-6">
              <div className="relative w-24 h-24 mx-auto">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="text-[#FDF8F5] stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" />
                  <motion.circle 
                    className="text-[#A7C080] stroke-current" 
                    strokeWidth="8" 
                    strokeLinecap="round" 
                    cx="50" cy="50" r="40" 
                    fill="transparent"
                    strokeDasharray="251.2"
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 - (251.2 * (uploadProgress.current / uploadProgress.total)) }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-[#A7C080]">
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">사진 분석 중...</h3>
                <p className="text-[#8E8E8E] text-sm">
                  {uploadProgress.current} / {uploadProgress.total} 장 완료
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* Onboarding View */}
        {view === 'onboarding' && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-xl border border-[#A7C080]/10 text-center">
              <div className="w-24 h-24 bg-[#A7C080]/10 rounded-full flex items-center justify-center text-[#A7C080] mx-auto mb-8">
                <Baby size={48} fill="currentColor" />
              </div>
              <h1 className="text-3xl font-bold mb-2">추억의 보물 상자</h1>
              <p className="text-[#8E8E8E] mb-10 leading-relaxed">
                자녀 프로필을 먼저 등록해 주세요.<br />
                아이의 소중한 순간들을 기록할 준비가 되었습니다.
              </p>

              <form onSubmit={handleAddChild} className="space-y-6 text-left">
                <div>
                  <label className="block text-sm font-bold text-[#4B4453] mb-2 ml-1">아이 이름</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-4 bg-[#FDF8F5] rounded-2xl border-2 border-transparent focus:border-[#A7C080]/30 focus:bg-white transition-all outline-none"
                    placeholder="예: 지훈"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#4B4453] mb-2 ml-1">생년월일</label>
                  <input
                    type="date"
                    required
                    value={newBirthDate}
                    onChange={(e) => setNewBirthDate(e.target.value)}
                    className="w-full p-4 bg-[#FDF8F5] rounded-2xl border-2 border-transparent focus:border-[#A7C080]/30 focus:bg-white transition-all outline-none"
                  />
                </div>
                <button type="submit" className="w-full bg-[#A7C080] text-white py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#8FA86A] transition-colors shadow-lg shadow-[#A7C080]/20">
                  프로필 생성하기 <ChevronRight size={20} />
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* Dashboard View */}
        {view === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col"
          >
            {/* Header */}
            <header className="bg-white border-b border-[#A7C080]/10 sticky top-0 z-30 p-4 shadow-sm">
              <div className="max-w-6xl mx-auto flex justify-between items-center">
                <button 
                  onClick={() => setView('profiles')}
                  className="flex items-center gap-3 bg-[#FDF8F5] hover:bg-[#F5F0E8] p-2 pr-4 rounded-2xl transition-all border border-[#A7C080]/10"
                >
                  <div className="w-10 h-10 bg-[#A7C080] rounded-xl flex items-center justify-center text-white overflow-hidden relative">
                    {activeChild?.profileImage ? (
                      <Image src={URL.createObjectURL(activeChild.profileImage)} fill className="object-cover" alt="Profile" referrerPolicy="no-referrer" />
                    ) : (
                      <Baby size={20} fill="currentColor" />
                    )}
                  </div>
                  <div className="text-left">
                    <h2 className="text-sm font-black leading-tight text-[#4B4453]">{activeChild?.name}</h2>
                    <p className="text-[10px] text-[#8E8E8E]">프로필 전환</p>
                  </div>
                </button>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setView('video-list')}
                    className="flex items-center gap-2 px-4 py-2 text-[#8E8E8E] hover:text-[#A7C080] transition-colors font-bold"
                  >
                    <List size={20} />
                    <span>영상 목록</span>
                  </button>
                  <label className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold cursor-pointer transition-all ${!activeChildId ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#A7C080] text-white hover:bg-[#8FA86A] shadow-lg shadow-[#A7C080]/20'}`}>
                    <Upload size={18} />
                    <span>사진 추가</span>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      disabled={!activeChildId}
                      onChange={handlePhotoUpload} 
                    />
                  </label>
                </div>
              </div>
            </header>

            <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
              {photos === undefined ? (
                <div className="h-[60vh] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-[#A7C080]" size={48} />
                    <p className="text-[#8E8E8E] font-bold">추억을 불러오는 중...</p>
                  </div>
                </div>
              ) : photos.length === 0 ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-32 h-32 bg-white rounded-[40px] shadow-xl border border-[#A7C080]/10 flex items-center justify-center text-[#A7C080] mx-auto mb-4">
                    <ImageIcon size={64} fill="currentColor" className="opacity-10" />
                  </div>
                  <h1 className="text-3xl font-black text-[#4B4453]">
                    아직 등록된 추억이 없어요.
                  </h1>
                  <p className="text-[#8E8E8E] text-lg max-w-md">
                    상단의 &apos;사진 추가&apos; 버튼을 눌러 {activeChild?.name}의 소중한 순간들을 기록해 보세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-16 pb-32">
                  <div className="flex justify-between items-end">
                    <div>
                      <h1 className="text-3xl font-black text-[#4B4453]">{activeChild?.name}의 타임라인</h1>
                      <p className="text-[#8E8E8E] mt-1">총 {photos.length}개의 소중한 순간이 담겨 있습니다.</p>
                    </div>
                  </div>

                  {/* Grouped Timeline */}
                  {groupedPhotos?.map((group) => (
                    <div key={group.monthYear} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-[#A7C080]/20"></div>
                        <h2 className="text-lg font-black text-[#A7C080] bg-white px-4 py-1 rounded-full border border-[#A7C080]/10 shadow-sm">
                          {group.monthYear}
                        </h2>
                        <div className="h-px flex-1 bg-[#A7C080]/20"></div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {group.items.map((photo, index) => (
                          <motion.div 
                            key={photo.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => togglePhotoSelection(photo.id!)}
                            className={`group relative bg-white rounded-[32px] overflow-hidden shadow-sm hover:shadow-xl transition-all border-4 cursor-pointer ${selectedPhotoIds.includes(photo.id!) ? 'border-[#A7C080]' : 'border-transparent'}`}
                          >
                            <div className="aspect-square relative">
                              <Image 
                                src={URL.createObjectURL(photo.blob)} 
                                fill 
                                className="object-cover transition-transform duration-500 group-hover:scale-110" 
                                alt={photo.fileName} 
                                referrerPolicy="no-referrer" 
                              />
                              
                              {/* Selection Checkmark */}
                              {selectedPhotoIds.includes(photo.id!) && (
                                <div className="absolute inset-0 bg-[#A7C080]/20 flex items-center justify-center">
                                  <div className="w-12 h-12 bg-[#A7C080] rounded-full flex items-center justify-center text-white shadow-lg">
                                    <Check size={28} strokeWidth={4} />
                                  </div>
                                </div>
                              )}

                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(photo.id!);
                                  }}
                                  className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-red-500 transition-colors"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                              
                              <div className="absolute top-4 left-4 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-full text-[11px] font-black text-[#A7C080] shadow-sm">
                                {formatAge(photo.ageInMonths)}
                              </div>
                            </div>
                            
                            <div className="p-4 space-y-2">
                              <div className="flex items-center gap-2 text-[#8E8E8E] text-[11px] font-bold">
                                <Clock size={12} />
                                {new Date(photo.takenAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>

            {/* Selection Bar */}
            <AnimatePresence>
              {selectedPhotoIds.length > 0 && (
                <motion.div 
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  exit={{ y: 100 }}
                  className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-6"
                >
                  <div className="bg-[#4B4453] text-white p-4 rounded-[32px] shadow-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 ml-2">
                      <div className="w-10 h-10 bg-[#A7C080] rounded-full flex items-center justify-center font-black">
                        {selectedPhotoIds.length}
                      </div>
                      <span className="font-bold">사진이 선택됨</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedPhotoIds([])}
                        className="px-4 py-2 text-sm font-bold text-white/60 hover:text-white"
                      >
                        취소
                      </button>
                      <button 
                        onClick={startNewVideoProject}
                        className="bg-[#A7C080] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#8FA86A] transition-all"
                      >
                        <Video size={18} />
                        <span>새 영상 만들기</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Video Editor View (Step 4: Storyboard & Metadata) */}
        {view === 'video-editor' && (
          <motion.div
            key="video-editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col bg-white"
          >
            <header className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-30">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 text-[#8E8E8E] hover:text-[#4B4453]">
                  <ArrowLeft size={24} />
                </button>
                <input 
                  type="text" 
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="text-xl font-black text-[#4B4453] outline-none border-b-2 border-transparent focus:border-[#A7C080] transition-all"
                  placeholder="프로젝트 제목"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-[#FDF8F5] px-4 py-2 rounded-2xl border border-[#A7C080]/10">
                  <Music size={18} className="text-[#A7C080]" />
                  <select 
                    value={selectedBgm}
                    onChange={(e) => setSelectedBgm(e.target.value)}
                    className="bg-transparent font-bold text-sm outline-none text-[#4B4453]"
                  >
                    <option value="BGM_1">BGM 1 (잔잔한)</option>
                    <option value="BGM_2">BGM 2 (발랄한)</option>
                    <option value="BGM_3">BGM 3 (감동적인)</option>
                  </select>
                </div>
                <button 
                  onClick={saveVideoProject}
                  className="bg-[#A7C080] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#8FA86A] transition-all shadow-lg shadow-[#A7C080]/20"
                >
                  <Save size={18} />
                  <span>프로젝트 저장</span>
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 bg-[#FDF8F5]">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-[#4B4453]">스토리보드 구성</h2>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={generateAiCaptions}
                      disabled={isGeneratingCaptions || storyboard.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-[#A7C080] border-2 border-[#A7C080]/20 rounded-2xl font-bold hover:border-[#A7C080] transition-all disabled:opacity-50"
                    >
                      {isGeneratingCaptions ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Sparkles size={18} />
                      )}
                      <span>AI 자막 생성</span>
                    </button>
                    <p className="text-[#8E8E8E] text-sm">사진을 배치하고 자막을 입력해 보세요.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {storyboard.map((item, index) => {
                    const photo = photos?.find(p => p.id === item.photoId);
                    if (!photo) return null;

                    return (
                      <motion.div 
                        key={`${item.photoId}-${index}`}
                        layout
                        className="bg-white p-6 rounded-[32px] shadow-sm border border-[#A7C080]/10 flex gap-6 items-center"
                      >
                        <div className="text-2xl font-black text-[#A7C080] w-8">
                          {index + 1}
                        </div>
                        <div className="w-32 h-32 relative rounded-2xl overflow-hidden shrink-0">
                          <Image src={URL.createObjectURL(photo.blob)} fill className="object-cover" alt="Scene" referrerPolicy="no-referrer" />
                          <div className="absolute top-2 left-2 px-2 py-1 bg-white/90 rounded-lg text-[10px] font-black text-[#A7C080]">
                            {formatAge(photo.ageInMonths)}
                          </div>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2 text-[#8E8E8E] text-xs font-bold">
                            <Calendar size={12} />
                            {new Date(photo.takenAt).toLocaleDateString()}
                          </div>
                          <textarea 
                            value={item.caption}
                            onChange={(e) => updateCaption(index, e.target.value)}
                            placeholder="이 순간의 이야기를 적어주세요..."
                            className="w-full p-4 bg-[#FDF8F5] rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#A7C080]/20 resize-none h-20 text-sm font-medium"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => moveStoryboardItem(index, 'up')}
                            disabled={index === 0}
                            className="p-2 bg-[#FDF8F5] rounded-xl text-[#8E8E8E] hover:text-[#4B4453] disabled:opacity-30"
                          >
                            <ChevronUp size={20} />
                          </button>
                          <button 
                            onClick={() => moveStoryboardItem(index, 'down')}
                            disabled={index === storyboard.length - 1}
                            className="p-2 bg-[#FDF8F5] rounded-xl text-[#8E8E8E] hover:text-[#4B4453] disabled:opacity-30"
                          >
                            <ChevronDown size={20} />
                          </button>
                          <button 
                            onClick={() => setStoryboard(prev => prev.filter((_, i) => i !== index))}
                            className="p-2 bg-red-50 rounded-xl text-red-300 hover:text-red-500"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <button 
                  onClick={() => setView('dashboard')}
                  className="w-full py-6 border-2 border-dashed border-[#A7C080]/20 rounded-[32px] text-[#8E8E8E] font-bold flex items-center justify-center gap-2 hover:border-[#A7C080]/50 hover:text-[#A7C080] transition-all"
                >
                  <Plus size={24} /> 사진 더 추가하기
                </button>
              </div>
            </main>
          </motion.div>
        )}

        {/* Video Projects List View */}
        {view === 'video-list' && (
          <motion.div
            key="video-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-6 max-w-4xl mx-auto w-full"
          >
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 text-[#8E8E8E] hover:text-[#4B4453]">
                  <ArrowLeft size={24} />
                </button>
                <h1 className="text-2xl font-black text-[#4B4453]">{activeChild?.name}의 영상 프로젝트</h1>
              </div>
              <button 
                onClick={() => setView('dashboard')}
                className="bg-[#A7C080] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#8FA86A] transition-all"
              >
                <Plus size={18} />
                <span>새 프로젝트</span>
              </button>
            </div>

            {!videoProjects || videoProjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-24 h-24 bg-white rounded-3xl shadow-md border border-[#A7C080]/10 flex items-center justify-center text-[#A7C080] opacity-20">
                  <Video size={48} />
                </div>
                <p className="text-[#8E8E8E] font-bold">아직 저장된 영상 프로젝트가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {videoProjects.map(project => (
                  <motion.div 
                    key={project.id}
                    className="bg-white p-6 rounded-[32px] shadow-sm border border-[#A7C080]/10 flex justify-between items-center group hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-[#FDF8F5] rounded-2xl flex items-center justify-center text-[#A7C080]">
                        <Video size={32} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-[#4B4453]">{project.title}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[#8E8E8E] font-bold">
                          <span className="flex items-center gap-1"><ImageIcon size={14} /> {project.scenes.length}장</span>
                          <span className="flex items-center gap-1"><Clock size={14} /> {new Date(project.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => loadProject(project)}
                        className="p-4 bg-[#FDF8F5] text-[#A7C080] rounded-2xl font-bold hover:bg-[#A7C080] hover:text-white transition-all flex items-center gap-2"
                      >
                        <Edit3 size={20} /> 편집하기
                      </button>
                      <button 
                        onClick={() => deleteProject(project.id!)}
                        className="p-4 text-[#E5E5E5] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Profile Management View */}
        {view === 'profiles' && (
          <motion.div
            key="profiles"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full"
          >
            <div className="flex justify-between items-center mb-10">
              <h1 className="text-2xl font-bold text-[#4B4453]">자녀 프로필 관리</h1>
              <button onClick={() => setView('dashboard')} className="p-2 text-[#8E8E8E] hover:text-[#4B4453]">
                <X size={28} />
              </button>
            </div>

            <div className="grid gap-4 mb-10">
              {children?.map(child => (
                <div 
                  key={child.id}
                  className={`p-6 rounded-[32px] border-2 transition-all flex justify-between items-center ${activeChildId === child.id ? 'border-[#A7C080] bg-[#A7C080]/5 shadow-md' : 'border-white bg-white shadow-sm'}`}
                >
                  <div 
                    className="flex items-center gap-4 cursor-pointer flex-1"
                    onClick={() => {
                      setActiveChildId(child.id!);
                      setView('dashboard');
                    }}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white overflow-hidden relative ${activeChildId === child.id ? 'bg-[#A7C080]' : 'bg-[#E5E5E5]'}`}>
                      {child.profileImage ? (
                        <Image src={URL.createObjectURL(child.profileImage)} fill className="object-cover" alt="Profile" referrerPolicy="no-referrer" />
                      ) : (
                        <Baby size={28} fill="currentColor" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-[#4B4453]">{child.name}</h3>
                        {activeChildId === child.id && (
                          <span className="bg-[#A7C080] text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Active</span>
                        )}
                      </div>
                      <p className="text-sm text-[#8E8E8E]">{child.birthDate}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteChild(child.id!)} className="p-3 text-[#E5E5E5] hover:text-red-400 transition-colors">
                    <Trash2 size={22} />
                  </button>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setShowAddProfileModal(true)}
              className="w-full py-8 border-2 border-dashed border-[#A7C080]/20 rounded-[32px] text-[#8E8E8E] font-bold flex items-center justify-center gap-2 hover:border-[#A7C080]/50 hover:text-[#A7C080] transition-all bg-white/50"
            >
              <Plus size={28} /> 새로운 자녀 추가
            </button>

            {/* Add Profile Modal */}
            <AnimatePresence>
              {showAddProfileModal && (
                <div className="fixed inset-0 bg-[#4B4453]/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl border border-[#A7C080]/10"
                  >
                    <div className="flex justify-between items-center mb-8">
                      <h2 className="text-2xl font-bold text-[#4B4453]">자녀 추가</h2>
                      <button onClick={() => setShowAddProfileModal(false)} className="text-[#8E8E8E] hover:text-[#4B4453]">
                        <X size={24} />
                      </button>
                    </div>

                    <form onSubmit={handleAddChild} className="space-y-6">
                      <label className="relative block w-24 h-24 mx-auto cursor-pointer group">
                        <div className="w-full h-full bg-[#FDF8F5] rounded-3xl flex items-center justify-center text-[#8E8E8E] overflow-hidden border-2 border-dashed border-[#A7C080]/20 group-hover:border-[#A7C080]/50 transition-all">
                          {newProfileImage ? (
                            <Image src={URL.createObjectURL(newProfileImage)} fill className="object-cover" alt="Profile" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Camera size={24} />
                              <span className="text-[10px] font-bold">사진 추가</span>
                            </div>
                          )}
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setNewProfileImage(file);
                          }} 
                        />
                      </label>

                      <div>
                        <label className="block text-sm font-bold text-[#4B4453] mb-2 ml-1">이름</label>
                        <input
                          type="text"
                          required
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="w-full p-4 bg-[#FDF8F5] rounded-2xl border-none focus:ring-2 focus:ring-[#A7C080]/20 outline-none"
                          placeholder="아이의 이름을 입력하세요"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4B4453] mb-2 ml-1">생일</label>
                        <input
                          type="date"
                          required
                          value={newBirthDate}
                          onChange={(e) => setNewBirthDate(e.target.value)}
                          className="w-full p-4 bg-[#FDF8F5] rounded-2xl border-none focus:ring-2 focus:ring-[#A7C080]/20 outline-none"
                        />
                      </div>
                      <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => setShowAddProfileModal(false)} className="flex-1 py-4 bg-[#FDF8F5] text-[#8E8E8E] rounded-2xl font-bold hover:bg-[#F5F0E8] transition-colors">취소</button>
                        <button type="submit" className="flex-1 py-4 bg-[#A7C080] text-white rounded-2xl font-bold hover:bg-[#8FA86A] transition-colors shadow-lg shadow-[#A7C080]/20">추가하기</button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
