import React, { useEffect, useRef } from 'react';

interface PretextReaderProps {
  sentences: string[];
  activeSentenceIndex: number;
  onSentenceClick: (index: number) => void;
  scrollMode?: 'center' | 'natural';
}

export const PretextReader: React.FC<PretextReaderProps> = ({
  sentences,
  activeSentenceIndex,
  onSentenceClick,
  scrollMode = 'center',
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

  return (
    <div className="pretext-reader-root">
      {/* Title block */}
      <div
        className={`vscroll-block title-block ${activeSentenceIndex === 0 ? 'active' : activeSentenceIndex > 0 ? 'past' : ''}`}
        onClick={() => onSentenceClick(0)}
        ref={activeSentenceIndex === 0 ? activeRef : undefined}
      >
        <h2 className={`sentence ${activeSentenceIndex === 0 ? 'active' : activeSentenceIndex > 0 ? 'past' : 'future'}`}>
          {title}
        </h2>
      </div>

      {/* Body sentences */}
      {body.map((sentence, i) => {
        const globalIndex = i + 1;
        const isActive = globalIndex === activeSentenceIndex;
        const isPast = globalIndex < activeSentenceIndex;
        const stateClass = isActive ? 'active' : isPast ? 'past' : 'future';

        return (
          <div
            key={globalIndex}
            className="vscroll-block"
            onClick={() => onSentenceClick(globalIndex)}
            ref={isActive ? activeRef : undefined}
          >
            <p className={`sentence ${stateClass}`}>
              {sentence}
            </p>
          </div>
        );
      })}
    </div>
  );
};
