import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  FileText, Plus, Search, Library, Trash2, CheckSquare, Square, 
  Settings, Volume2, SkipBack, SkipForward, Play, Pause, X, Globe, ChevronDown,
  LayoutGrid, List, AlignJustify, Maximize2, Minimize2, FolderPlus, Folder as FolderIcon,
  RotateCcw, FastForward, Bookmark, History, Shuffle, ClipboardCheck
} from 'lucide-react';
import { logger } from './utils/logger';
import { useVoice } from './hooks/useVoice';
import { parsePDF, parseDOCX, parseEPUB } from './utils/parsers';
import { motion, AnimatePresence } from 'framer-motion';
import { PretextReader } from './components/PretextReader';
import { initDebugApi } from './utils/debugApi';

declare const __APP_VERSION__: string;

interface BookmarkEntry {
  index: number;
  note?: string;
  timestamp: number;
}

interface Folder {
  id: string;
  name: string;
}

interface LibraryEntry {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  bookmarks?: BookmarkEntry[];
  rate?: number;
  folderId?: string;
  cover?: string;
}

const App: React.FC = () => {
  const [library, setLibrary] = useState<LibraryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-library');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) { console.error('Failed to init library', e); }
    return [];
  });
  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-folders');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) { console.error('Failed to init folders', e); }
    return [];
  });
  const [scrollMode, setScrollMode] = useState<'center' | 'natural'>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-settings');
      if (saved) {
        const { scrollMode: savedScrollMode } = JSON.parse(saved);
        if (savedScrollMode) return savedScrollMode;
      }
    } catch (e) {}
    return 'center';
  });

  const [showOnlyPremium, setShowOnlyPremium] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-settings');
      if (saved) {
        const { showOnlyPremium: savedVal } = JSON.parse(saved);
        return savedVal ?? true;
      }
    } catch (e) {}
    return true;
  });

  const [showAllLanguages, setShowAllLanguages] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-settings');
      if (saved) {
        const { showAllLanguages: savedVal } = JSON.parse(saved);
        return savedVal ?? false;
      }
    } catch (e) {}
    return false;
  });

  const [readerFontSize, setReaderFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-reader-settings');
      if (saved) {
        const { fontSize } = JSON.parse(saved);
        if (fontSize) return fontSize;
      }
    } catch (e) {}
    return 1.25;
  });

  const [readerFontFamily, setReaderFontFamily] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('voice-reader-reader-settings');
      if (saved) {
        const { fontFamily } = JSON.parse(saved);
        if (fontFamily) return fontFamily;
      }
    } catch (e) {}
    return "'Outfit', sans-serif";
  });
  
  const [fileName, setFileName] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all' | 'uncategorized'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsingCount, setParsingCount] = useState(0);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [libraryView, setLibraryView] = useState<'list' | 'grid' | 'compact'>('grid');
  const [isLibraryFull, setIsLibraryFull] = useState(false);
  const [libraryWidth, setLibraryWidth] = useState(600);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set(['US']));

  const {
    isPlaying, rate, setRate,
    speak, pause, stop, preview, refreshVoices,
    selectedVoice, setSelectedVoice, voices,
  } = useVoice();

  const filteredVoices = useMemo(() => {
    let result = voices;
    if (!showAllLanguages) {
      result = result.filter(v => v.lang.startsWith('en'));
    }
    if (showOnlyPremium) {
      result = result.filter(v => v.isPremium);
    }
    return [...result].sort((a, b) => {
      // 1. Locale priority: US > UK > Australia > other English > others
      const getLocalePriority = (lang: string) => {
        if (lang === 'en-US') return 1;
        if (lang === 'en-GB') return 2;
        if (lang === 'en-AU') return 3;
        if (lang.startsWith('en')) return 4;
        return 5;
      };
      
      const prioA = getLocalePriority(a.lang);
      const prioB = getLocalePriority(b.lang);
      if (prioA !== prioB) return prioA - prioB;

      // 2. Premium first within the same locale group
      if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
      
      // 3. Alphabetical
      return a.name.localeCompare(b.name);
    });
  }, [voices, showOnlyPremium, showAllLanguages]);

  const groupedVoices = useMemo(() => {
    const groups: Record<string, { label: string, voices: any[] }> = {
      'US': { label: 'United States', voices: [] },
      'UK': { label: 'United Kingdom', voices: [] },
      'AU': { label: 'Australia', voices: [] },
      'EN': { label: 'Other English', voices: [] },
      'OTHER': { label: 'Other Languages', voices: [] }
    };

    filteredVoices.forEach(v => {
      if (v.lang === 'en-US') groups['US'].voices.push(v);
      else if (v.lang === 'en-GB') groups['UK'].voices.push(v);
      else if (v.lang === 'en-AU') groups['AU'].voices.push(v);
      else if (v.lang.startsWith('en')) groups['EN'].voices.push(v);
      else groups['OTHER'].voices.push(v);
    });

    return Object.entries(groups)
      .filter(([_, group]) => group.voices.length > 0)
      .map(([id, group]) => ({ id, ...group }));
  }, [filteredVoices]);

  // Auto-expand selected voice's region when picker opens
  useEffect(() => {
    if (showVoicePicker && selectedVoice) {
      const region = selectedVoice.lang === 'en-US' ? 'US' :
                     selectedVoice.lang === 'en-GB' ? 'UK' :
                     selectedVoice.lang === 'en-AU' ? 'AU' :
                     selectedVoice.lang.startsWith('en') ? 'EN' : 'OTHER';
      setExpandedRegions(prev => new Set(prev).add(region));
    }
  }, [showVoicePicker, selectedVoice]);

  const isFirstRender = useRef(true);

  // iOS 18+ Background Audio Keep-Alive
  // This prevents the browser from killing speech synthesis when the screen locks
  useEffect(() => {
    if (!/iPhone|iPad/.test(navigator.userAgent)) return;
    
    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;

    const startSilentAudio = () => {
      try {
        if (audioCtx) return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        audioCtx = new AudioContextClass();
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        
        // Nearly silent but enough to keep the audio session active
        gainNode.gain.value = 0.001; 
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        logger.info('iOS Background Audio Keep-Alive active');
      } catch (err) {
        logger.error('Failed to start background audio keep-alive', err);
      }
    };

    // iOS requires a user interaction to start the AudioContext
    window.addEventListener('touchstart', startSilentAudio, { once: true });
    window.addEventListener('click', startSilentAudio, { once: true });

    return () => {
      if (oscillator) {
        try { oscillator.stop(); } catch(e) {}
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch(e) {}
      }
    };
  }, []);

  const toggleFullscreen = () => {
    const docElm = document.documentElement as any;
    const doc = document as any;

    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      const req = docElm.requestFullscreen || docElm.webkitRequestFullscreen || docElm.msRequestFullscreen;
      if (req) {
        req.call(docElm).catch((err: any) => {
          setNotification({ 
            message: 'Fullscreen is not supported by this browser (common on iPhones). Try Zen Mode instead!', 
            type: 'error' 
          });
          logger.warn(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        setNotification({ 
          message: 'Fullscreen is not supported by your device.', 
          type: 'error' 
        });
      }
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) {
        exit.call(doc);
      }
    }
  };

  const goHome = () => {
    setContent('');
    setFileName('');
    setActiveSentenceIndex(-1);
    stop(); // Ensure speech stops
    setShowLibrary(false);
    setShowSettings(false);
    setFocusMode(false);
  };

  const handleResize = useCallback((e: MouseEvent) => {
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < 1200) {
      setLibraryWidth(newWidth);
    }
  }, []);

  const stopResizing = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, [handleResize]);

  const startResizing = useCallback(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'ew-resize';
  }, [handleResize, stopResizing]);

  useEffect(() => {
    if (isFirstRender.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('voice-reader-library', JSON.stringify(library));
      } catch (e) {
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          console.warn('Storage quota exceeded, could not save library.');
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [library]);

  useEffect(() => {
    localStorage.setItem('voice-reader-folders', JSON.stringify(folders));
  }, [folders]);

  const [content, setContent] = useState<string>('');
  // Load session position from storage
  useEffect(() => {
    const lastSession = localStorage.getItem('voice-reader-last-session');
    if (lastSession) {
      try {
        const { bookId, index, furthest } = JSON.parse(lastSession);
        const book = library.find(b => b.id === bookId);
        if (book) {
          setContent(book.content);
          setFileName(book.title);
          setActiveSentenceIndex(index);
          setFurthestIndex(furthest || index);
          if (book.rate) setRate(book.rate);
        }
      } catch (e) {}
    }
  }, []); // Only on mount

  // Persist settings
  useEffect(() => {
    if (isFirstRender.current) return;
    localStorage.setItem('voice-reader-settings', JSON.stringify({ scrollMode, showOnlyPremium, showAllLanguages }));
  }, [scrollMode, showOnlyPremium, showAllLanguages]);

  useEffect(() => {
    if (isFirstRender.current) return;
    localStorage.setItem('voice-reader-reader-settings', JSON.stringify({ 
      fontSize: readerFontSize, 
      fontFamily: readerFontFamily 
    }));
  }, [readerFontSize, readerFontFamily]);

  // Persist session position and update library-wide rate
  useEffect(() => {
    if (content && fileName) {
      setLibrary(prev => {
        const item = prev.find(b => b.title === fileName);
        if (item && item.rate !== rate) {
          const updated = prev.map(b => b.title === fileName ? { ...b, rate } : b);
          localStorage.setItem('voice-reader-library', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });

      if (activeSentenceIndex >= 0) {
        if (activeSentenceIndex > furthestIndex) {
          setFurthestIndex(activeSentenceIndex);
        }
        const book = library.find(b => b.title === fileName);
        if (book) {
          localStorage.setItem('voice-reader-last-session', JSON.stringify({ 
            bookId: book.id, 
            index: activeSentenceIndex,
            furthest: Math.max(furthestIndex, activeSentenceIndex)
          }));
        }
      }
    }
  }, [content, activeSentenceIndex, fileName, library, furthestIndex, rate]);

  // Notification timeout
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Initialize Global Error Handlers and debug API
  useEffect(() => {
    if (isFirstRender.current) {
      logger.initGlobalHandlers();
    }
    initDebugApi({ 
      library, 
      setLibrary, 
      processUrl, 
      setContent, 
      setFileName,
      setLibraryView,
      setReaderFontSize,
      setReaderFontFamily,
      setSelectedIds,
      deleteSelected,
      selectAll
    });
  }, [library, setLibrary]); 

  // Preview voice/speed when paused; restart when playing
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (isPlaying && activeSentenceIndex >= 0) {
      const t = setTimeout(() => playFromIndex(activeSentenceIndex), 250);
      return () => clearTimeout(t);
    } else if (!isPlaying && content) {
      preview();
    }
  }, [rate, selectedVoice]); // eslint-disable-line

  // Split content into sentences
  const sentences = useMemo(() => {
    try {
      if (!content) return [];
      const result: string[] = [];
      if (fileName) result.push(fileName.replace(/\.[^/.]+$/, ''));
      
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          // Compatible splitting: use a delimiter then clean up
          const parts = trimmed
            .replace(/([.!?])\s+/g, "$1|")
            .split("|")
            .filter(s => s.trim().length > 0);
            
          for (const p of parts) result.push(p);
        }
      }
      logger.info(`Sentence splitting complete. Found ${result.length} sentences.`);
      return result.length > 0 ? result : [content];
    } catch (e) {
      logger.error('Failed to process sentences', e);
      return [content || ''];
    }
  }, [content, fileName]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); handleSpeak(); }
      if (e.key === 'ArrowRight') playFromIndex(Math.min(sentences.length - 1, activeSentenceIndex + 1));
      if (e.key === 'ArrowLeft') playFromIndex(Math.max(0, activeSentenceIndex - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSentenceIndex, sentences, isPlaying]); // eslint-disable-line

  const generateId = () => {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsParsing(true);
    setParsingCount(files.length);
    
    for (const file of files) {
      try {
        // Size check for mobile safety
        logger.info(`Starting import of ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        if (file.size > 25 * 1024 * 1024) {
          throw new Error('File is too large (max 25MB for mobile stability)');
        }

        let parsed: { text: string; cover?: string };
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf')) {
          logger.info('Routing to PDF parser');
          parsed = await parsePDF(file);
        } else if (name.endsWith('.docx')) {
          logger.info('Routing to DOCX parser');
          parsed = await parseDOCX(file);
        } else if (name.endsWith('.epub')) {
          logger.info('Routing to EPUB parser');
          parsed = await parseEPUB(file);
        } else {
          logger.warn(`Unsupported file type: ${file.name}`);
          continue;
        }
        
        if (!parsed.text) {
          logger.warn(`Parser returned empty text for ${file.name}`);
          continue;
        }
        
        logger.info(`Successfully parsed ${file.name}, text length: ${parsed.text.length}`);

        const entry: LibraryEntry = { 
          id: generateId(), 
          title: file.name, 
          content: parsed.text,
          cover: parsed.cover,
          timestamp: Date.now(),
          folderId: selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized' ? selectedFolderId : undefined
        };

        logger.info(`Updating library state for ${file.name}...`);
        setLibrary(prev => {
          const updated = [entry, ...prev.filter(i => i.title !== file.name)].slice(0, 50);
          try {
            logger.info(`Saving library to localStorage (${updated.length} items)...`);
            localStorage.setItem('voice-reader-library', JSON.stringify(updated));
            logger.info('Library saved successfully.');
          } catch (e) {
            logger.error('Storage full or failed', e);
            setNotification({ message: 'Library storage issue. Try deleting some books.', type: 'error' });
            return prev;
          }
          return updated;
        });

        logger.info(`Updating content state...`);
        // Only switch view if we don't have active content yet
        setContent(prev => {
          if (!prev) {
            logger.info(`Switching to new document: ${file.name}`);
            setFileName(file.name);
            setActiveSentenceIndex(-1);
            setNotification({ message: `Added "${file.name}" to library`, type: 'success' });
            return parsed.text;
          }
          logger.info('Content already exists, added to library in background.');
          return prev;
        });
      } catch (err) {
        logger.error(`Failed to parse ${file.name}:`, err);
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setNotification({ message: `Failed to import "${file.name}": ${errMsg}`, type: 'error' });
      } finally {
        setParsingCount(prev => Math.max(0, prev - 1));
      }
    }
    setIsParsing(false);
  };

  const handleUrlLoad = () => {
    const url = prompt('Enter document URL (PDF, EPUB, DOCX):');
    if (url) processUrl(url);
  };

  const processUrl = async (url: string) => {
    setIsParsing(true);
    setParsingCount(1);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch document.');
      const blob = await response.blob();
      
      if (blob.size > 25 * 1024 * 1024) {
        throw new Error('Remote file is too large (max 25MB)');
      }

      let name = url.split('/').pop()?.split('?')[0] || 'remote-document.epub';
      if (!name.includes('.')) name += '.epub';

      let parsed: { text: string; cover?: string };
      const lowerName = name.toLowerCase();
      const file = new File([blob], name, { type: blob.type });

      if (lowerName.endsWith('.pdf')) parsed = await parsePDF(file);
      else if (lowerName.endsWith('.docx')) parsed = await parseDOCX(file);
      else if (lowerName.endsWith('.epub')) parsed = await parseEPUB(file);
      else throw new Error('Unsupported format');
      
      if (!parsed.text) throw new Error('No readable content found.');
      
      setFileName(name);
      setContent(parsed.text);
      setActiveSentenceIndex(-1);

      const entry: LibraryEntry = { 
        id: generateId(), 
        title: name, 
        content: parsed.text, 
        cover: parsed.cover,
        timestamp: Date.now(),
        folderId: selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized' ? selectedFolderId : undefined
      };

      setLibrary(prev => {
        const updated = [entry, ...prev.filter(i => i.title !== name)].slice(0, 50);
        try {
          localStorage.setItem('voice-reader-library', JSON.stringify(updated));
        } catch (e) {
          console.error('Storage full', e);
          setNotification({ message: 'Library is full. Please delete some books.', type: 'error' });
          return prev;
        }
        return updated;
      });
      setNotification({ message: `Loaded "${name}" from URL`, type: 'success' });
    } catch (err) {
      logger.error('URL Load error:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to load from URL';
      setNotification({ message: errMsg, type: 'error' });
    } finally {
      setIsParsing(false);
      setParsingCount(0);
    }
  };

  const createFolder = () => {
    const name = prompt('Folder Name:');
    if (!name) return;
    const newFolder: Folder = { id: Math.random().toString(36).slice(2), name };
    setFolders(prev => {
      const updated = [...prev, newFolder];
      localStorage.setItem('voice-reader-folders', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteFolder = (id: string) => {
    if (!confirm('Delete this folder? (Books will be uncategorized)')) return;
    setFolders(prev => {
      const updated = prev.filter(f => f.id !== id);
      localStorage.setItem('voice-reader-folders', JSON.stringify(updated));
      return updated;
    });
    setLibrary(prev => {
      const updated = prev.map(item => item.folderId === id ? { ...item, folderId: undefined } : item);
      localStorage.setItem('voice-reader-library', JSON.stringify(updated));
      return updated;
    });
    if (selectedFolderId === id) setSelectedFolderId('all');
  };

  const moveToFolder = (itemId: string, folderId?: string) => {
    setLibrary(prev => {
      const updated = prev.map(item => item.id === itemId ? { ...item, folderId } : item);
      localStorage.setItem('voice-reader-library', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteLibraryItem = (id: string) => {
    if (confirm('Delete this from library?')) {
      setLibrary(prev => prev.filter(i => i.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleSelect = (id: string, isMulti: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isMulti) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id) && next.size === 1) next.clear();
        else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredLibrary.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLibrary.map(i => i.id)));
    }
  };

  const deleteSelected = () => {
    if (confirm(`Delete ${selectedIds.size} items?`)) {
      setLibrary(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
    }
  };

  const moveSelected = (folderId?: string) => {
    setLibrary(prev => prev.map(item => 
      selectedIds.has(item.id) ? { ...item, folderId } : item
    ));
    setSelectedIds(new Set());
  };

  const filteredLibrary = useMemo(() => {
    if (!Array.isArray(library)) return [];
    return library.filter(item => {
      if (!item || !item.title) return false;
      const titleLower = item.title.toLowerCase();
      const queryLower = searchQuery.toLowerCase();
      const matchesSearch = titleLower.includes(queryLower);
      const matchesFolder = 
        selectedFolderId === 'all' || 
        (selectedFolderId === 'uncategorized' && !item.folderId) ||
        item.folderId === selectedFolderId;
      return matchesSearch && matchesFolder;
    });
  }, [library, searchQuery, selectedFolderId]);

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && (url.startsWith('http') || url.startsWith('https'))) {
      processUrl(url);
      return;
    }

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
    }
  };

  const playFromIndex = useCallback((index: number) => {
    if (index >= sentences.length) { stop(); return; }
    setActiveSentenceIndex(index);
    speak(sentences[index], () => {
      // Logic handled in PretextReader via scrollMode prop
    }, () => {
      if (index + 1 < sentences.length) playFromIndex(index + 1);
      else stop();
    });
  }, [sentences, speak, stop]);

  const handleSpeak = () => {
    if (isPlaying) pause();
    else playFromIndex(activeSentenceIndex >= 0 ? activeSentenceIndex : 0);
  };

  const toggleBookmark = () => {
    if (!fileName || activeSentenceIndex < 0) return;
    
    setLibrary(prev => {
      const updated = prev.map(item => {
        if (item.title === fileName) {
          const currentBookmarks = item.bookmarks || [];
          const exists = currentBookmarks.some(b => b.index === activeSentenceIndex);
          const nextBookmarks = exists 
            ? currentBookmarks.filter(b => b.index !== activeSentenceIndex)
            : [...currentBookmarks, { index: activeSentenceIndex, timestamp: Date.now() }].sort((a, b) => a.index - b.index);
          
          return { ...item, bookmarks: nextBookmarks };
        }
        return item;
      });
      localStorage.setItem('voice-reader-library', JSON.stringify(updated));
      return updated;
    });
  };

  const updateBookmarkNote = (index: number, note: string) => {
    setLibrary(prev => {
      const updated = prev.map(item => {
        if (item.title === fileName) {
          const nextBookmarks = (item.bookmarks || []).map(b => 
            b.index === index ? { ...b, note } : b
          );
          return { ...item, bookmarks: nextBookmarks };
        }
        return item;
      });
      localStorage.setItem('voice-reader-library', JSON.stringify(updated));
      return updated;
    });
  };

  const progress = sentences.length > 0 ? ((activeSentenceIndex + 1) / sentences.length) * 100 : 0;

  const currentBook = useMemo(() => 
    Array.isArray(library) ? library.find(b => b.title === fileName) : undefined
  , [library, fileName]);
  const isBookmarked = currentBook?.bookmarks?.some(b => b.index === activeSentenceIndex) || false;

  return (
    <div 
      className={`app-root${focusMode ? ' focus-mode' : ''}${isDragging ? ' dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="drop-zone"
          >
            <div className="drop-zone-content">
              <Globe size={48} />
              <p>Drop to Import Narrative</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {/* ── Navigation ── */}
      <nav className="app-nav">
        <div className="nav-logo" onClick={goHome} style={{ cursor: 'pointer' }} title="Go to Home">
          <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
          <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
          <div className="nav-logo-bar" style={{ height: 26 }} />
          <span className="nav-logo-title">LEXTIO</span>
          <span className="version-tag">v{__APP_VERSION__}</span>
          <div className="nav-logo-bar" style={{ height: 26 }} />
          <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
          <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
        </div>

        <div className="nav-actions">
          <button className="nav-btn" onClick={() => setShowSettings(true)}>
            <Settings size={16} />
            <span className="nav-btn-label">Settings</span>
          </button>
          <button className="nav-btn" onClick={() => setShowLibrary(true)}>
            <Library size={16} />
            <span className="nav-btn-label">Library</span>
          </button>
          <button className="nav-btn" onClick={handleUrlLoad} title="Load from URL">
            <Globe size={16} />
          </button>
          <input type="file" id="file-upload" style={{ display: 'none' }} accept=".pdf,.docx,.epub,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileUpload} multiple />
          <label htmlFor="file-upload" className="nav-upload-label">
            <span>{fileName ? 'Add More' : 'Upload'}</span>
          </label>
        </div>
      </nav>

      {/* ── Main Reader ── */}
      <main 
        className="reader-container"
        onClick={() => setFocusMode(prev => !prev)}
      >
        {content ? (
          <div className="animate-fade-in">
            <PretextReader
              sentences={sentences}
              activeSentenceIndex={activeSentenceIndex}
              onSentenceClick={playFromIndex}
              scrollMode={scrollMode}
              fontSize={readerFontSize}
              fontFamily={readerFontFamily}
            />
          </div>
        ) : !isParsing ? (
          <div className="empty-state">
            <FileText size={90} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.12)', marginBottom: '1.25rem' }} />
            <p className="empty-label">Begin Your Journey</p>
            <p className="empty-sub">Upload a PDF, EPUB, or DOCX to start</p>
          </div>
        ) : null}

        {/* Background Parsing Indicator */}
        <AnimatePresence>
          {isParsing && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="background-loader glass"
            >
              <div className="spinner-small" />
              <span>{parsingCount > 0 ? `Importing ${parsingCount} Narrative${parsingCount > 1 ? 's' : ''}...` : 'Processing...'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Controls Footer ── */}
      <footer className="controls-footer glass">

        {/* Notification Toast */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className={`rate-warning-toast ${notification.type}`}
              style={{ 
                background: notification.type === 'error' ? 'rgba(255, 82, 82, 0.9)' : 
                            notification.type === 'success' ? 'rgba(76, 175, 80, 0.9)' : undefined 
              }}
            >
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="control-main-row">

          {/* Left: Volume + Waveform */}
          <div className="control-left">
            <div className="volume-pill">
              <Volume2 size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              <div className="volume-track">
                <div className="volume-fill" />
              </div>
              <span className="vol-label">100%</span>
            </div>
            <div 
              className={`voice-box${showVoicePicker ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowVoicePicker(!showVoicePicker);
              }}
              title="Select Voice"
              style={{ position: 'relative' }}
            >
              <div className="voice-box-content">
                <Globe size={14} style={{ color: 'var(--accent)' }} />
                <span className="voice-name-label">
                  {selectedVoice?.name.split(' ')[0] || 'Narrator'}
                </span>
                <ChevronDown size={12} className="dropdown-arrow" />
              </div>
              
              <AnimatePresence>
                {showVoicePicker && (
                  <motion.div 
                    className="voice-picker-menu glass"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="voice-picker-header">
                      Select Narrator
                    </div>
                    <div className="voice-picker-list">
                      {groupedVoices.map(group => (
                        <div key={group.id} className={`voice-group-item${expandedRegions.has(group.id) ? ' expanded' : ''}`}>
                          <div 
                            className="voice-group-header"
                            onClick={() => {
                              const next = new Set(expandedRegions);
                              if (next.has(group.id)) next.delete(group.id);
                              else next.add(group.id);
                              setExpandedRegions(next);
                            }}
                          >
                            <span className="voice-group-label">
                              {group.label}
                              <span className="voice-group-count">({group.voices.length})</span>
                            </span>
                            <ChevronDown size={12} className="voice-group-chevron" />
                          </div>
                          
                          {expandedRegions.has(group.id) && (
                            <div className="voice-group-content">
                              {group.voices.map(v => (
                                <div 
                                  key={v.name}
                                  className={`voice-picker-item${selectedVoice?.name === v.name ? ' active' : ''}`}
                                  onClick={() => {
                                    setSelectedVoice(v.voice);
                                    setShowVoicePicker(false);
                                  }}
                                >
                                  <div className="voice-item-info">
                                    <span className="voice-item-name">{v.name}</span>
                                    <span className="voice-item-lang">{v.lang.split('-')[0].toUpperCase()}</span>
                                  </div>
                                  {v.isPremium && <span className="premium-sparkle">✨</span>}
                                  {selectedVoice?.name === v.name && <div className="active-dot" />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center: Playback */}
          <div className="play-controls">
            <button className="btn-icon" onClick={() => playFromIndex(Math.max(0, activeSentenceIndex - 1))}>
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button className="play-button" onClick={handleSpeak}>
              {isPlaying
                ? <Pause size={24} fill="currentColor" />
                : <Play size={24} fill="currentColor" style={{ marginLeft: 3 }} />
              }
            </button>
            <button className="btn-icon" onClick={() => playFromIndex(Math.min(sentences.length - 1, activeSentenceIndex + 1))}>
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button 
              className="btn-icon" 
              onClick={() => {
                stop();
                playFromIndex(0);
              }} 
              style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}
              title="Start from Beginning"
            >
              <RotateCcw size={16} />
            </button>
            <button 
              className="btn-icon" 
              onClick={() => {
                stop();
                playFromIndex(furthestIndex);
              }} 
              style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}
              title="Return to Furthest Read"
            >
              <FastForward size={16} />
            </button>
          </div>

          {/* Right: Speed + Icons */}
          <div className="control-right">
            <div className="speed-adjust-group">
              <button 
                className="speed-btn-small" 
                onClick={() => setRate(Math.max(0.5, Math.round((rate - 0.1) * 10) / 10))}
              >
                −
              </button>
              <div className="speed-readout">
                {rate.toFixed(1)}
              </div>
              <button 
                className="speed-btn-small" 
                onClick={() => setRate(Math.min(4.0, Math.round((rate + 0.1) * 10) / 10))}
              >
                +
              </button>
            </div>
            <div className="extra-icons">
              <button 
                className={`btn-icon-small${isBookmarked ? ' active' : ''}`} 
                onClick={toggleBookmark}
                title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
              >
                <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
              </button>
              <button 
                className={`btn-icon-small${focusMode ? ' active' : ''}`} 
                onClick={() => setFocusMode(!focusMode)}
                title="Zen Focus Mode"
              >
                <Shuffle size={14} />
              </button>
              <button 
                className="btn-icon-small" 
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

        </div>

        {/* Progress Bar */}
        <div className="progress-strip">
          <span className="time-label">{Math.max(0, activeSentenceIndex + 1)}</span>
          <div
            className="progress-track"
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              playFromIndex(Math.floor(((e.clientX - r.left) / r.width) * sentences.length));
            }}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="time-label">{sentences.length}</span>
        </div>

      </footer>

      {/* ── Library Sidebar ── */}
      <AnimatePresence>
        {showLibrary && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
              onClick={() => setShowLibrary(false)}
            />
              <motion.div
                initial={isLibraryFull ? { opacity: 0 } : { x: '100%' }} 
                animate={isLibraryFull ? { x: 0, opacity: 1, width: '100%', maxWidth: '100%' } : { x: 0, width: libraryWidth }} 
                exit={isLibraryFull ? { opacity: 0 } : { x: '100%' }}
                transition={isLibraryFull ? { type: 'spring', damping: 28, stiffness: 260 } : { type: 'tween', duration: 0.2 }}
                className={`library-panel glass ${isLibraryFull ? 'full-screen' : ''}`}
              >
                {!isLibraryFull && (
                  <div className="resize-handle" onMouseDown={startResizing} />
                )}
                <div className="library-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <div className="nav-logo" onClick={goHome} style={{ cursor: 'pointer', transform: 'scale(0.8)', transformOrigin: 'left center' }} title="Go to Home">
                      <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
                      <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
                      <div className="nav-logo-bar" style={{ height: 26 }} />
                      <span className="nav-logo-title">LEXTIO</span>
                      <div className="nav-logo-bar" style={{ height: 26 }} />
                      <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
                      <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
                    </div>
                    <div className="v-divider" />
                    <h2 className="library-title" style={{ margin: 0 }}>
                      <Library size={18} style={{ color: 'var(--accent)' }} /> Library
                    </h2>
                    <button 
                      className={`select-all-btn ${selectedIds.size === filteredLibrary.length && filteredLibrary.length > 0 ? 'active' : ''}`}
                      onClick={selectAll}
                      title="Select All"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}
                    >
                      {selectedIds.size === filteredLibrary.length && filteredLibrary.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
                      Select All
                    </button>
                  </div>
                  <div className="library-controls">
                    <button 
                      className="control-icon-btn highlight" 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      title="Import Document"
                    >
                      <Plus size={18} />
                    </button>
                    <button 
                      className="control-icon-btn highlight" 
                      onClick={handleUrlLoad}
                      title="Import from URL"
                    >
                      <Globe size={18} />
                    </button>
                    <div className="v-divider" />
                    <button 
                      className={`control-icon-btn ${libraryView === 'grid' ? 'active' : ''}`} 
                      onClick={() => setLibraryView('grid')}
                      title="Grid View"
                    >
                      <LayoutGrid size={18} />
                    </button>
                    <button 
                      className={`control-icon-btn ${libraryView === 'list' ? 'active' : ''}`} 
                      onClick={() => setLibraryView('list')}
                      title="List View"
                    >
                      <List size={18} />
                    </button>
                    <button 
                      className={`control-icon-btn ${libraryView === 'compact' ? 'active' : ''}`} 
                      onClick={() => setLibraryView('compact')}
                      title="Compact View"
                    >
                      <AlignJustify size={18} />
                    </button>
                    <div className="v-divider" />
                    <button 
                      className="control-icon-btn" 
                      onClick={() => setIsLibraryFull(!isLibraryFull)}
                      title={isLibraryFull ? "Exit Full Screen" : "Full Screen"}
                    >
                      {isLibraryFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                    <div className="v-divider" />
                    <button className="control-icon-btn" onClick={() => setShowLibrary(false)} title="Close Library">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {selectedIds.size > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="bulk-actions-bar glass"
                  >
                    <span className="selection-count">{selectedIds.size} selected</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select 
                        className="move-to-select"
                        onChange={(e) => moveSelected(e.target.value || undefined)}
                        defaultValue=""
                      >
                        <option value="" disabled>Move to...</option>
                        <option value="">No Folder</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <button className="bulk-delete-btn" onClick={deleteSelected}>
                        <Trash2 size={14} /> Delete
                      </button>
                      <button className="bulk-cancel-btn" onClick={() => setSelectedIds(new Set())}>Cancel</button>
                    </div>
                  </motion.div>
                )}

              {/* Search Bar */}
              <div className="search-container">
                <Search size={16} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Search your collection..." 
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

                {/* Folders List */}
                <div className="folders-section">
                  <div 
                    className={`folder-chip ${selectedFolderId === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedFolderId('all')}
                  >
                    <History size={14} /> All
                  </div>
                  <div 
                    className={`folder-chip ${selectedFolderId === 'uncategorized' ? 'active' : ''}`}
                    onClick={() => setSelectedFolderId('uncategorized')}
                  >
                    <FileText size={14} /> Unsorted
                  </div>
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      className={`folder-chip ${selectedFolderId === folder.id ? 'active' : ''}`}
                      onClick={() => setSelectedFolderId(folder.id)}
                    >
                      <FolderIcon size={14} /> {folder.name}
                      <button className="folder-delete-btn" onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                  <button className="folder-chip add-folder" onClick={createFolder} title="New Folder">
                    <FolderPlus size={14} /> New
                  </button>
                </div>

                <div className={`library-list ${libraryView}`}>
                  {filteredLibrary.length === 0 ? (
                    <p className="library-empty">No narratives found</p>
                  ) : filteredLibrary.map(item => (
                    <div key={item.id} className={`library-item-group ${libraryView}`}>
                      <div
                        className={`library-item ${currentBook?.id === item.id ? 'active' : ''} ${selectedIds.has(item.id) ? 'selected' : ''}`}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            toggleSelect(item.id, true);
                          } else if (selectedIds.size > 0) {
                            toggleSelect(item.id, true);
                          } else {
                            setContent(item.content);
                            setFileName(item.title);
                            setActiveSentenceIndex(-1);
                            if (item.rate) setRate(item.rate);
                            setShowLibrary(false);
                          }
                        }}
                      >
                        {libraryView === 'grid' && (
                          <div className="library-item-cover">
                            {item.cover ? (
                              <img src={item.cover} alt={item.title} />
                            ) : (
                              <div className="cover-placeholder">
                                <FileText size={48} />
                              </div>
                            )}
                            <div className="selection-overlay">
                              {selectedIds.has(item.id) ? <CheckSquare size={24} /> : <Plus size={24} />}
                            </div>
                          </div>
                        )}
                        
                        <div className="library-item-info">
                          {(libraryView === 'list' || libraryView === 'compact') && (
                            <div 
                              className={`item-select-checkbox ${selectedIds.has(item.id) ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); toggleSelect(item.id, true); }}
                            >
                              {selectedIds.has(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </div>
                          )}
                          {(libraryView === 'list') && (
                            <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p className="library-item-title">{item.title}</p>
                            {libraryView !== 'compact' && (
                              <p className="library-item-date">
                                {new Date(item.timestamp).toLocaleDateString()}
                                {item.folderId && folders.find(f => f.id === item.folderId) && (
                                  <span className="folder-tag">
                                    • {folders.find(f => f.id === item.folderId)?.name}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {libraryView !== 'compact' && (
                          <div className="library-item-actions">
                            <select 
                              className="move-to-select"
                              value={item.folderId || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => moveToFolder(item.id, e.target.value || undefined)}
                            >
                              <option value="">No Folder</option>
                              {folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                            <button 
                              className="delete-item-btn" 
                              onClick={(e) => { e.stopPropagation(); deleteLibraryItem(item.id); }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {item.bookmarks && item.bookmarks.length > 0 && libraryView === 'list' && (
                        <div className="library-bookmarks">
                          {item.bookmarks.map(bm => (
                            <div key={bm.index} className="library-bookmark-wrapper">
                              <button 
                                className="library-bookmark-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContent(item.content);
                                  setFileName(item.title);
                                  if (item.rate) setRate(item.rate);
                                  playFromIndex(bm.index);
                                  setShowLibrary(false);
                                }}
                              >
                                <Bookmark size={10} fill="currentColor" style={{ marginRight: 4 }} />
                                S{bm.index + 1}
                              </button>
                              <input 
                                type="text" 
                                className="bookmark-note-input"
                                placeholder="Add note..."
                                defaultValue={bm.note || ''}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => updateBookmarkNote(bm.index, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Settings Sidebar ── */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="library-panel glass"
            >
              <div className="library-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                  <div className="nav-logo" onClick={goHome} style={{ cursor: 'pointer', transform: 'scale(0.8)', transformOrigin: 'left center' }} title="Go to Home">
                    <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
                    <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
                    <div className="nav-logo-bar" style={{ height: 26 }} />
                    <span className="nav-logo-title">LEXTIO</span>
                    <div className="nav-logo-bar" style={{ height: 26 }} />
                    <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
                    <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
                  </div>
                  <div className="v-divider" />
                  <h2 className="library-title" style={{ margin: 0 }}>
                    <Settings size={18} style={{ color: 'var(--accent)' }} /> Settings
                  </h2>
                </div>
                <button className="control-icon-btn" onClick={() => setShowSettings(false)} title="Close">
                  <X size={18} />
                </button>
              </div>
              
              <div className="settings-list">
                
                {/* Voice Selection */}
                <div className="settings-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <label className="settings-label" style={{ margin: 0 }}>Narrator Voice</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button 
                        onClick={refreshVoices}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, padding: 0, textDecoration: 'underline' }}
                        title="Force refresh system voices"
                      >
                        REFRESH
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={showAllLanguages} 
                          onChange={(e) => setShowAllLanguages(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        ALL LANGUAGES
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={showOnlyPremium} 
                          onChange={(e) => setShowOnlyPremium(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        PREMIUM ONLY
                      </label>
                    </div>
                  </div>
                  
                  {/iPhone|iPad/.test(navigator.userAgent) && (
                    <div style={{
                      marginTop: '0.875rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}>
                      <div className="pro-tip" style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Volume2 size={14} /> iOS 18+ Voice Note
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
                          <strong>Important:</strong> Apple restricts "Siri" and "Enhanced" voices to system apps only. They are usually blocked for web browsers (Safari, Chrome, Edge).
                          <br /><br />
                          Lextio automatically selects the highest quality voices allowed by your phone (like <strong>Rishi ✨</strong> or <strong>Tessa ✨</strong>). 
                          If the Narrator list is empty, tap <strong>REFRESH</strong> or ensure you are not in "Lockdown Mode."
                        </p>
                      </div>
                    </div>
                  )}

                  <select 
                    value={selectedVoice?.name || ''} 
                    onChange={(e) => {
                      const v = voices.find(v => v.voice.name === e.target.value);
                      if (v) setSelectedVoice(v.voice);
                    }}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      padding: '0.875rem',
                      borderRadius: '12px',
                      outline: 'none',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit'
                    }}
                  >
                    {filteredVoices.map(v => (
                      <option key={v.name} value={v.name} style={{ background: '#1a1d21' }}>
                        {v.isPremium ? '✨ ' : ''}{v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speed Slider */}
                <div className="settings-group">
                  <label className="settings-label">Playback Speed ({rate}x)</label>
                  <input 
                    type="range" min="0.5" max="4" step="0.1" 
                    value={rate} 
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>

                {/* Reading Mode */}
                <div className="settings-group">
                  <label className="settings-label">Scrolling Behavior</label>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button 
                      onClick={() => setScrollMode('center')}
                      style={{ 
                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: scrollMode === 'center' ? 'var(--accent)' : 'transparent',
                        color: scrollMode === 'center' ? '#000' : 'rgba(255,255,255,0.4)',
                        fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s'
                      }}
                    >
                      Centered
                    </button>
                    <button 
                      onClick={() => setScrollMode('natural')}
                      style={{ 
                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: scrollMode === 'natural' ? 'var(--accent)' : 'transparent',
                        color: scrollMode === 'natural' ? '#000' : 'rgba(255,255,255,0.4)',
                        fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s'
                      }}
                    >
                      Natural
                    </button>
                  </div>
                </div>

                {/* Reader Appearance */}
                <div className="settings-group">
                  <label className="settings-label">Reader Font</label>
                  <select 
                    value={readerFontFamily} 
                    onChange={(e) => setReaderFontFamily(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      padding: '0.875rem',
                      borderRadius: '12px',
                      outline: 'none',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      marginBottom: '1rem'
                    }}
                  >
                    <option value="'Outfit', sans-serif">Outfit (Default)</option>
                    <option value="'Inter', sans-serif">Inter</option>
                    <option value="'Lora', serif">Lora (Serif)</option>
                    <option value="'Merriweather', serif">Merriweather (Serif)</option>
                    <option value="'Roboto Mono', monospace">Roboto Mono</option>
                    <option value="'Playfair Display', serif">Playfair Display</option>
                  </select>

                  <label className="settings-label">Font Size ({readerFontSize}rem)</label>
                  <input 
                    type="range" min="0.8" max="3" step="0.05" 
                    value={readerFontSize} 
                    onChange={(e) => setReaderFontSize(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>

                {/* Debug Info */}
                <div className="settings-group">
                  <label className="settings-label">Support & Debugging</label>
                  <button 
                    onClick={() => {
                      const report = logger.getDebugReport();
                      navigator.clipboard.writeText(report);
                      setNotification({ message: 'Debug report copied to clipboard', type: 'success' });
                    }}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--accent)',
                      padding: '0.875rem',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em'
                    }}
                  >
                    <ClipboardCheck size={14} /> Copy Debug Report
                  </button>
                  <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.5rem', textAlign: 'center' }}>
                    Share this report with support to troubleshoot issues.
                  </p>
                </div>

              </div>

              {/* Version Info */}
              <div style={{ 
                marginTop: 'auto', 
                padding: '1.5rem', 
                borderTop: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
                opacity: 0.3
              }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Lextio v{__APP_VERSION__}
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};


export default App;
