import { useState, useRef, useCallback, useEffect } from 'react';

export const useTTS = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const audioQueueRef = useRef([]);

  // Split text into sentences for faster streaming
  const splitIntoSentences = useCallback((text) => {
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const processedSentences = [];
    sentences.forEach((sentence) => {
      if (sentence.length > 400) {
        const majorBreaks = sentence.split(/[;—]\s+/);
        majorBreaks.forEach((part, index) => {
          if (index < majorBreaks.length - 1) {
            part += ';';
          }

          if (part.length > 300) {
            const commaBreaks = part.split(/,\s+/);
            let currentChunk = '';

            commaBreaks.forEach((chunk, chunkIndex) => {
              const separator = chunkIndex < commaBreaks.length - 1 ? ', ' : '';
              if (currentChunk.length + chunk.length + separator.length <= 300) {
                currentChunk += chunk + separator;
              } else {
                if (currentChunk) {
                  processedSentences.push(currentChunk.trim());
                }
                currentChunk = chunk + separator;
              }
            });

            if (currentChunk) {
              processedSentences.push(currentChunk.trim());
            }
          } else {
            processedSentences.push(part.trim());
          }
        });
      } else {
        processedSentences.push(sentence);
      }
    });

    return processedSentences.filter(s => s.length > 0);
  }, []);

  // Generate audio for a single sentence
  const generateAudioForSentence = useCallback(async (text, voice) => {
    try {
      const response = await fetch('/api/tts/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'orpheus',
          input: text,
          voice: voice,
          response_format: 'wav',
          speed: 1.0
        }),
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`TTS API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const audioBlob = await response.blob();
      return URL.createObjectURL(audioBlob);
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Cannot connect to TTS service. Please check your connection.');
      }
      throw error;
    }
  }, []);

  // Generate audio queue with streaming playback
  const generateAudioQueue = useCallback(async (text, voice) => {
    const sentences = splitIntoSentences(text);
    console.log(`Total sentences to process: ${sentences.length}`);

    if (sentences.length === 0) {
      console.warn('No sentences found in text content');
      return [];
    }

    const audioUrls = [];
    setIsLoadingAudio(true);

    try {
      const initialBatch = Math.min(3, sentences.length);

      for (let i = 0; i < initialBatch; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const audioUrl = await generateAudioForSentence(sentences[i], voice);
        audioUrls.push(audioUrl);
        console.log(`Generated audio for sentence ${i + 1}/${sentences.length}: "${sentences[i].substring(0, 50)}..."`);
      }

      if (audioUrls.length > 0) {
        setAudioQueue([...audioUrls]);
        setIsLoadingAudio(false);

        if (sentences.length > initialBatch) {
          setTimeout(async () => {
            for (let i = initialBatch; i < sentences.length; i++) {
              if (abortControllerRef.current?.signal.aborted) {
                break;
              }

              try {
                const audioUrl = await generateAudioForSentence(sentences[i], voice);
                setAudioQueue(prev => [...prev, audioUrl]);
                console.log(`Generated audio for sentence ${i + 1}/${sentences.length}: "${sentences[i].substring(0, 50)}..."`);
              } catch (error) {
                console.error(`Failed to generate audio for sentence ${i + 1}:`, error);
              }
            }
            console.log('Finished generating all audio segments');
          }, 100);
        }

        return audioUrls;
      }

      return [];
    } catch (error) {
      setIsLoadingAudio(false);
      throw error;
    }
  }, [splitIntoSentences, generateAudioForSentence]);

  // Handle audio ended event
  const handleAudioEnded = useCallback(() => {
    setCurrentAudioIndex(prev => {
      const nextIndex = prev + 1;
      if (nextIndex < audioQueue.length) {
        setTimeout(() => {
          if (audioRef.current && audioQueue[nextIndex]) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = audioQueue[nextIndex];
            audioRef.current.load();
            audioRef.current.play().catch(error => {
              console.error('Audio play error:', error);
              handleAudioEnded();
            });
          }
        }, 50);
      } else {
        setIsSpeaking(false);
        setAudioQueue([]);
        audioQueue.forEach(url => URL.revokeObjectURL(url));
      }
      return nextIndex;
    });
  }, [audioQueue]);

  // Stop speaking function
  const stopSpeaking = useCallback(() => {
    // Use a flag to prevent multiple calls
    if (!isSpeaking && !isLoadingAudio && audioQueueRef.current.length === 0) {
      return; // Already stopped
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Clean up audio URLs
    audioQueueRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // Ignore errors from already revoked URLs
      }
    });
    
    // Reset all state in one batch to minimize re-renders
    setAudioQueue([]);
    setCurrentAudioIndex(0);
    setIsSpeaking(false);
    setIsLoadingAudio(false);
  }, [isSpeaking, isLoadingAudio]);

  // Start speaking function
  const speakText = useCallback(async (text, voice = 'mia') => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    if (!text.trim()) {
      throw new Error('No text content available for speech');
    }

    try {
      abortControllerRef.current = new AbortController();
      setIsSpeaking(true);
      setCurrentAudioIndex(0);

      const audioUrls = await generateAudioQueue(text, voice);

      if (audioUrls.length > 0 && !abortControllerRef.current.signal.aborted) {
        setTimeout(() => {
          if (audioRef.current && audioUrls[0]) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = audioUrls[0];
            audioRef.current.load();
            audioRef.current.play().catch(error => {
              console.error('Initial audio play error:', error);
              setIsSpeaking(false);
              setIsLoadingAudio(false);
            });
          }
        }, 100);
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      setIsSpeaking(false);
      setIsLoadingAudio(false);
      throw error;
    }
  }, [isSpeaking, stopSpeaking, generateAudioQueue]);

  // Cleanup effect - only run on unmount
  useEffect(() => {
    return () => {
      // Only cleanup on unmount, use stopSpeaking for other cases
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Clean up any remaining URLs
      audioQueueRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          // Ignore errors from already revoked URLs
        }
      });
    };
  }, []);

  // Keep audioQueueRef in sync with audioQueue for cleanup
  useEffect(() => {
    audioQueueRef.current = audioQueue;
  }, [audioQueue]);

  return {
    isSpeaking,
    isLoadingAudio,
    audioQueue,
    currentAudioIndex,
    audioRef,
    speakText,
    stopSpeaking,
    handleAudioEnded
  };
};