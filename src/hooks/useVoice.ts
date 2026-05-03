import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

export interface FormattedVoice {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  maxRate: number;
  isPremium: boolean;
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
    const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);

    const formattedVoices = availableVoices.map(v => {
      const isPremium = v.name.includes('Natural') || 
                        v.name.includes('Enhanced') || 
                        v.name.includes('Siri') || 
                        v.name.includes('Premium') ||
                        v.name.includes('Neural');
      
      return {
        voice: v,
        name: v.name,
        lang: v.lang,
        // Premium voices usually have a lower max rate before sounding 'choppy' or failing.
        maxRate: isPremium ? 2.0 : 4.0,
        isPremium
      };
    });

    setVoices(formattedVoices);
    
    // Default to high-quality American English
    let preferred = availableVoices.find(v => v.lang === 'en-US' && (v.name.includes('Natural') || v.name.includes('Enhanced')));
    
    if (!preferred && isApple) {
      preferred = availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Siri')) ||
                  availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Samantha (Enhanced)')) ||
                  availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Alex'));
    }

    if (!preferred) {
      preferred = availableVoices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                  availableVoices.find(v => v.lang === 'en-US') ||
                  availableVoices[0];
    }
                       
    if (preferred) setSelectedVoice(preferred);
  }, [synth]);

  useEffect(() => {
    updateVoices();
    
    // iOS voice loading quirk: voices often take a moment to populate
    const timer = setInterval(() => {
      const currentVoices = synth.getVoices();
      if (currentVoices.length > 0) {
        updateVoices();
        clearInterval(timer);
      }
    }, 1000);

    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
    
    return () => {
      clearInterval(timer);
      if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = null;
      }
    };
  }, [updateVoices]);

  // Log detected voices for debugging
  useEffect(() => {
    if (voices.length > 0) {
      const voiceNames = voices.map(v => v.name).join(', ');
      logger.info(`Voices detected (${voices.length}): ${voiceNames}`);
    }
  }, [voices]);

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
