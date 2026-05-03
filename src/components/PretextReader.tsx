import React, { useEffect, useRef } from 'react';

interface PretextReaderProps {
  sentences: string[];
  activeSentenceIndex: number;
  onSentenceClick: (index: number) => void;
  scrollMode?: 'center' | 'natural';
  fontSize?: number;
  fontFamily?: string;
}

export const PretextReader: React.FC<PretextReaderProps> = ({
  sentences,
  activeSentenceIndex,
  onSentenceClick,
  scrollMode = 'center',
  fontSize = 1.25,
  fontFamily = "'Outfit', sans-serif",
}) => {
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active sentence into view
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: scrollMode === 'center' ? 'center' : 'nearest' 
      });
    }
  }, [activeSentenceIndex, scrollMode]);

  if (!sentences.length) return null;

  // First sentence is always the document title
  const [title, ...body] = sentences;

  // Windowed rendering to avoid DOM overload. 
  // We use a larger window (1000) to ensure fast scrolling doesn't "outrun" the text buffer.
  const WINDOW_SIZE = 1000;
  const halfWindow = Math.floor(WINDOW_SIZE / 2);
  
  // Calculate window range around active sentence (offset by 1 because body starts at index 1)
  const bodyActiveIdx = activeSentenceIndex - 1;
  let startIdx = Math.max(0, bodyActiveIdx - halfWindow);
  let endIdx = Math.min(body.length, startIdx + WINDOW_SIZE);
  
  // Adjust start if we're near the end
  if (endIdx === body.length) {
    startIdx = Math.max(0, endIdx - WINDOW_SIZE);
  }
 
  const visibleBody = body.slice(startIdx, endIdx);
  // Using 80px as a safer average height estimate for sentences + padding
  const topSpacerHeight = startIdx * 80; 
  const bottomSpacerHeight = (body.length - endIdx) * 80;

  return (
    <div className="pretext-reader-root" style={{ fontSize: `${fontSize}rem`, fontFamily }}>
      {/* Title block - Always render if visible or active */}
      {(startIdx === 0 || activeSentenceIndex === 0) && (
        <div
          className={`vscroll-block title-block ${activeSentenceIndex === 0 ? 'active' : activeSentenceIndex > 0 ? 'past' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSentenceClick(0);
          }}
          ref={activeSentenceIndex === 0 ? activeRef : undefined}
        >
          <h2 className={`sentence ${activeSentenceIndex === 0 ? 'active' : activeSentenceIndex > 0 ? 'past' : 'future'}`}>
            {title}
          </h2>
        </div>
      )}

      {/* Top Spacer */}
      {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

      {/* Visible Body sentences */}
      {visibleBody.map((sentence, i) => {
        const globalIndex = startIdx + i + 1;
        const isActive = globalIndex === activeSentenceIndex;
        const isPast = globalIndex < activeSentenceIndex;
        const stateClass = isActive ? 'active' : isPast ? 'past' : 'future';

        return (
          <div
            key={globalIndex}
            className="vscroll-block"
            onClick={(e) => {
              e.stopPropagation();
              onSentenceClick(globalIndex);
            }}
            ref={isActive ? activeRef : undefined}
          >
            <p className={`sentence ${stateClass}`}>
              {sentence}
            </p>
          </div>
        );
      })}

      {/* Bottom Spacer */}
      {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
    </div>
  );
};
