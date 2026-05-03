import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Settings, Library, Shuffle, Maximize2, History, FileText, RotateCcw, FastForward, Bookmark, Globe, Search, FolderPlus, Folder as FolderIcon, Trash2, LayoutGrid, List, Minimize2, Plus, AlignJustify, CheckSquare, Square, X } from 'lucide-react';
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
  const [focusMode, setFocusMode] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [libraryView, setLibraryView] = useState<'list' | 'grid' | 'compact'>('grid');
  const [isLibraryFull, setIsLibraryFull] = useState(false);
  const [libraryWidth, setLibraryWidth] = useState(600);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    isPlaying, rate, setRate,
    maxRateWarning, speak, pause, stop, preview,
    selectedVoice, setSelectedVoice, voices,
  } = useVoice();

  const isFirstRender = useRef(true);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
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

  // Persist library and folders
  useEffect(() => {
    try {
      localStorage.setItem('voice-reader-library', JSON.stringify(library));
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, could not save library.');
      }
    }
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
    localStorage.setItem('voice-reader-settings', JSON.stringify({ scrollMode }));
  }, [scrollMode]);

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

  // Initialize Debug API
  useEffect(() => {
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
  }, [library, setLibrary]); // Re-init when library changes to keep get() fresh

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
          const parts = trimmed.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
          for (const p of parts) result.push(p);
        }
      }
      return result.length > 0 ? result : [content];
    } catch (e) {
      console.error('Failed to process sentences', e);
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
        if (file.size > 25 * 1024 * 1024) {
          throw new Error('File is too large (max 25MB for mobile stability)');
        }

        let parsed: { text: string; cover?: string };
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf')) parsed = await parsePDF(file);
        else if (name.endsWith('.docx')) parsed = await parseDOCX(file);
        else if (name.endsWith('.epub')) parsed = await parseEPUB(file);
        else continue;
        
        if (!parsed.text) continue;

        const entry: LibraryEntry = { 
          id: generateId(), 
          title: file.name, 
          content: parsed.text,
          cover: parsed.cover,
          timestamp: Date.now(),
          folderId: selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized' ? selectedFolderId : undefined
        };

        setLibrary(prev => {
          const updated = [entry, ...prev.filter(i => i.title !== file.name)].slice(0, 50);
          try {
            localStorage.setItem('voice-reader-library', JSON.stringify(updated));
          } catch (e) {
            console.error('Storage full', e);
            setNotification({ message: 'Library is full. Please delete some books.', type: 'error' });
            return prev;
          }
          return updated;
        });
        setNotification({ message: `Added "${file.name}" to library`, type: 'success' });

        // Only switch view if we don't have active content yet
        setContent(prev => {
          if (!prev) {
            setFileName(file.name);
            setActiveSentenceIndex(-1);
            return parsed.text;
          }
          return prev;
        });
      } catch (err) {
        console.error(`Failed to parse ${file.name}:`, err);
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
      console.error('URL Load error:', err);
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
  const waveHeights = [40, 70, 50, 90, 60, 80, 45, 75, 55, 85, 50, 70, 40, 65];

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
        <div className="nav-logo">
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
      <main className="reader-container">
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
          {(maxRateWarning || notification) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className={`rate-warning-toast ${notification?.type || ''}`}
              style={{ 
                background: notification?.type === 'error' ? 'rgba(255, 82, 82, 0.9)' : 
                            notification?.type === 'success' ? 'rgba(76, 175, 80, 0.9)' : undefined 
              }}
            >
              {notification?.message || maxRateWarning}
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
            <div className="waveform-placeholder">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    height: isPlaying ? `${h}%` : '20%',
                    background: isPlaying ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                    transition: `height 0.4s ease ${i * 0.04}s, background 0.3s ease`,
                  }}
                />
              ))}
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
            <div className="speed-section">
              {[1, 2, 3, 4].map(s => (
                <button
                  key={s}
                  className={`speed-btn${Math.round(rate) === s ? ' active' : ''}`}
                  onClick={() => setRate(s)}
                >
                  {s}x
                </button>
              ))}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 className="library-title">
                      <Library size={22} style={{ color: 'var(--accent)' }} /> Library
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
              <h2 className="library-title">
                <Settings size={22} style={{ color: 'var(--accent)' }} /> Settings
              </h2>
              
              <div className="settings-list">
                
                {/* Voice Selection */}
                <div className="settings-group">
                  <label className="settings-label">Narrator Voice</label>
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
                    {voices.map(v => (
                      <option key={v.name} value={v.name} style={{ background: '#1a1d21' }}>{v.name}</option>
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

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};


export default App;
