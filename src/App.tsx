import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Settings, Library, Shuffle, Maximize2, History, FileText, ChevronRight, RotateCcw, FastForward, Bookmark } from 'lucide-react';
import { useVoice } from './hooks/useVoice';
import { parsePDF, parseDOCX, parseEPUB } from './utils/parsers';
import { motion, AnimatePresence } from 'framer-motion';
import { PretextReader } from './components/PretextReader';

interface BookmarkEntry {
  index: number;
  note?: string;
  timestamp: number;
}

interface LibraryEntry {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  bookmarks?: BookmarkEntry[];
  rate?: number;
}

const App: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollMode, setScrollMode] = useState<'center' | 'natural'>('center');
  const [focusMode, setFocusMode] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [furthestIndex, setFurthestIndex] = useState(0);

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

  // Load library and settings from storage
  useEffect(() => {
    const savedLib = localStorage.getItem('voice-reader-library');
    if (savedLib) setLibrary(JSON.parse(savedLib));
    
    const savedSettings = localStorage.getItem('voice-reader-settings');
    if (savedSettings) {
      const { scrollMode: savedScrollMode } = JSON.parse(savedSettings);
      if (savedScrollMode) setScrollMode(savedScrollMode);
    }

    // Restore last session
    const lastSession = localStorage.getItem('voice-reader-last-session');
    if (lastSession) {
      const { bookId, index, furthest } = JSON.parse(lastSession);
      const savedLibData = savedLib ? JSON.parse(savedLib) : [];
      const lastBook = savedLibData.find((b: any) => b.id === bookId);
      if (lastBook) {
        setContent(lastBook.content);
        setFileName(lastBook.title);
        setActiveSentenceIndex(index);
        setFurthestIndex(furthest || index);
        if (lastBook.rate) setRate(lastBook.rate);
      }
    }
  }, [setRate]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('voice-reader-settings', JSON.stringify({ scrollMode }));
  }, [scrollMode]);

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
    if (!content) return [];
    const result: string[] = [];
    if (fileName) result.push(fileName.replace(/\.[^/.]+$/, ''));
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        result.push(...trimmed.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0));
      }
    });
    return result.length > 0 ? result : [content];
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setFileName(file.name);
    try {
      let text = '';
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf')) text = await parsePDF(file);
      else if (name.endsWith('.docx')) text = await parseDOCX(file);
      else if (name.endsWith('.epub')) text = await parseEPUB(file);
      if (!text) throw new Error('No readable content found in file.');
      setContent(text);
      setActiveSentenceIndex(-1);
      const entry: LibraryEntry = { id: Math.random().toString(36).slice(2), title: file.name, content: text, timestamp: Date.now() };
      setLibrary(prev => {
        const updated = [entry, ...prev.filter(i => i.title !== file.name)].slice(0, 20);
        localStorage.setItem('voice-reader-library', JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setIsParsing(false);
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

  const currentBook = useMemo(() => library.find(b => b.title === fileName), [library, fileName]);
  const isBookmarked = currentBook?.bookmarks?.some(b => b.index === activeSentenceIndex) || false;

  return (
    <div className={`app-root${focusMode ? ' focus-mode' : ''}`}>
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {/* ── Navigation ── */}
      <nav className="app-nav">
        <div className="nav-logo">
          <div className="nav-logo-bar" style={{ height: 12, opacity: 0.35 }} />
          <div className="nav-logo-bar" style={{ height: 18, opacity: 0.6 }} />
          <div className="nav-logo-bar" style={{ height: 26 }} />
          <span className="nav-logo-title">LEXTIO</span>
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
          <input type="file" id="file-upload" style={{ display: 'none' }} accept=".pdf,.docx,.epub" onChange={handleFileUpload} />
          <label htmlFor="file-upload" className="nav-upload-label">
            <span>{fileName ? 'Change' : 'Upload'}</span>
          </label>
        </div>
      </nav>

      {/* ── Main Reader ── */}
      <main className="reader-container">
        {isParsing ? (
          <div className="loading-state">
            <div className="spinner" />
            <p className="loading-text">Initializing Narrative...</p>
          </div>
        ) : content ? (
          <div className="animate-fade-in">
            <PretextReader
              sentences={sentences}
              activeSentenceIndex={activeSentenceIndex}
              onSentenceClick={playFromIndex}
              scrollMode={scrollMode}
            />
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={90} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.12)', marginBottom: '1.25rem' }} />
            <p className="empty-label">Begin Your Journey</p>
            <p className="empty-sub">Upload a PDF, EPUB, or DOCX to start</p>
          </div>
        )}
      </main>

      {/* ── Controls Footer ── */}
      <footer className="controls-footer glass">

        {/* Rate Warning Toast */}
        <AnimatePresence>
          {maxRateWarning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="rate-warning-toast"
            >
              {maxRateWarning}
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
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="library-panel glass"
            >
              <h2 className="library-title">
                <History size={22} style={{ color: 'var(--accent)' }} /> Library
              </h2>
              <div className="library-list">
                {library.length === 0 ? (
                  <p className="library-empty">Archive is empty</p>
                ) : library.map(item => (
                  <div key={item.id} style={{ marginBottom: '1rem' }}>
                    <div
                      className="library-item"
                      onClick={() => {
                        setContent(item.content);
                        setFileName(item.title);
                        setActiveSentenceIndex(-1);
                        if (item.rate) setRate(item.rate);
                        setShowLibrary(false);
                      }}
                    >
                      <div className="library-item-info">
                        <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <div>
                          <p className="library-item-title">{item.title}</p>
                          <p className="library-item-date">{new Date(item.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <ChevronRight size={15} style={{ color: 'var(--text-dim)' }} />
                    </div>

                    {item.bookmarks && item.bookmarks.length > 0 && (
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

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};


export default App;
