import { useState, useEffect, useCallback, useRef } from 'react';

export interface FormattedVoice {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  maxRate: number;
}

export const useVoice = () => {
  const [voices, setVoices] = useState<FormattedVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [maxRateWarning, setMaxRateWarning] = useState<string | null>(null);
  const [currentTextIndex, setCurrentTextIndex] = useState(-1);
  
  const synth = window.speechSynthesis;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isManualStop = useRef(false);

  const updateVoices = useCallback(() => {
    const availableVoices = synth.getVoices();
    const formattedVoices = availableVoices.map(v => ({
      voice: v,
      name: v.name,
      lang: v.lang,
      // Natural voices often have a limit around 2x or 3x. 
      // We'll set a soft 'maxRate' for them and warn the user.
      maxRate: v.name.includes('Natural') ? 2.0 : 4.0
    }));

    setVoices(formattedVoices);
    
    // Default to high-quality American English Natural voice
    const preferred = availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Natural')) || 
                      availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                      availableVoices.find(v => v.lang === 'en-US') ||
                      availableVoices[0];
                      
    if (preferred) setSelectedVoice(preferred);
  }, [synth]);

  useEffect(() => {
    updateVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
  }, [updateVoices]);

  // Check for maxRate violations
  useEffect(() => {
    if (selectedVoice) {
      const currentVoiceInfo = voices.find(v => v.voice.name === selectedVoice.name);
      if (currentVoiceInfo && rate > currentVoiceInfo.maxRate) {
        setMaxRateWarning(`Warning: ${selectedVoice.name} typically supports up to ${currentVoiceInfo.maxRate}x speed.`);
      } else {
        setMaxRateWarning(null);
      }
    }
  }, [rate, selectedVoice, voices]);

  const stop = useCallback(() => {
    isManualStop.current = true;
    synth.cancel();
    setIsPlaying(false);
  }, [synth]);

  const speak = useCallback((text: string, onBoundary?: (index: number) => void, onEnd?: () => void) => {
    // Prevent the previous utterance's onend from triggering auto-progression
    isManualStop.current = true;
    synth.cancel();
    
    // Now prepare the new utterance
    isManualStop.current = false;
    
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    
    // Apply rate capping if needed for the utterance itself
    const voiceInfo = voices.find(v => v.voice.name === selectedVoice?.name);
    utterance.rate = voiceInfo ? Math.min(rate, voiceInfo.maxRate) : rate;
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      if (!isManualStop.current) {
        setIsPlaying(false);
        onEnd?.();
      }
    };
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || isManualStop.current) return;
      console.error('SpeechSynthesisError', event);
      setIsPlaying(false);
      onEnd?.();
    };
    
    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === 'sentence') {
        onBoundary?.(event.charIndex);
      }
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
  }, [synth, selectedVoice, rate, voices]);

  const pause = useCallback(() => {
    isManualStop.current = true;
    synth.cancel();
    setIsPlaying(false);
  }, [synth]);

  const resume = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const preview = useCallback(() => {
    synth.cancel();
    const voiceInfo = voices.find(v => v.voice.name === selectedVoice?.name);
    const effectiveRate = voiceInfo ? Math.min(rate, voiceInfo.maxRate) : rate;
    
    const utterance = new SpeechSynthesisUtterance(`Voice preview at ${effectiveRate.toFixed(1)} speed`);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = effectiveRate;
    synth.speak(utterance);
  }, [synth, selectedVoice, rate, voices]);

  return {
    voices,
    selectedVoice,
    setSelectedVoice,
    isPlaying,
    setIsPlaying,
    rate,
    setRate,
    maxRateWarning,
    speak,
    pause,
    resume,
    stop,
    preview,
    currentTextIndex,
    setCurrentTextIndex
  };
};
