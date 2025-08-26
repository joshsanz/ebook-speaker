import { useState, useRef, useCallback, useEffect } from 'react';

export const useTTS = (onAutoAdvance) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [totalAudioCount, setTotalAudioCount] = useState(0); // For progress display

  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const sentencesRef = useRef([]);
  const currentVoiceRef = useRef('');
  const currentSpeedRef = useRef(1.0);
  const isProcessingEndRef = useRef(false);
  const isNavigatingRef = useRef(false);

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
  const generateAudioForSentence = useCallback(async (text, voice, speed = 1.0) => {
    try {
      const response = await fetch('/api/tts/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice: voice,
          response_format: 'wav',
          speed: speed
        }),
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle service shutdown gracefully
        if (response.status === 503) {
          throw new Error('TTS service is restarting. Please try again in a moment.');
        }

        throw new Error(`TTS API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const audioBlob = await response.blob();

      if (audioBlob.size === 0) {
        throw new Error('Received empty audio response');
      }

      return URL.createObjectURL(audioBlob);
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Cannot connect to TTS service. Please check your connection.');
      }
      throw error;
    }
  }, []);

  // Generate audio queue with streaming playback
  const generateAudioQueue = useCallback(async (text, voice, speed = 1.0) => {
    const sentences = splitIntoSentences(text);

    if (sentences.length === 0) {
      return [];
    }

    // Store sentences and current settings for later regeneration
    sentencesRef.current = sentences;
    currentVoiceRef.current = voice;
    currentSpeedRef.current = speed;

    const audioUrls = [];
    setIsLoadingAudio(true);

    try {
      const initialBatch = Math.min(1, sentences.length);

      for (let i = 0; i < initialBatch; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const audioUrl = await generateAudioForSentence(sentences[i], voice, speed);
        audioUrls.push(audioUrl);
      }

      if (audioUrls.length > 0) {
        audioQueueRef.current = [...audioUrls];
        setTotalAudioCount(sentences.length);
        setIsLoadingAudio(false);

        if (sentences.length > initialBatch) {
          setTimeout(async () => {
            for (let i = initialBatch; i < sentences.length; i++) {
              if (abortControllerRef.current?.signal.aborted) {
                break;
              }

              try {
                console.log(`Generating audio for sentence ${i + 1}/${sentences.length}`);
                const audioUrl = await generateAudioForSentence(sentences[i], voice, speed);
                audioQueueRef.current.push(audioUrl);
                console.log(`Added audio ${i} to queue. Queue length: ${audioQueueRef.current.length}`);
              } catch (error) {
                // Don't log AbortError as a failure - it's expected when user clicks Stop
                if (error.name === 'AbortError') {
                  console.log(`Audio generation cancelled for sentence ${i + 1}`);
                  break; // Exit the loop when aborted
                } else {
                  console.error(`Failed to generate audio for sentence ${i + 1}:`, error);
                }
              }
            }
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

  // Regenerate remaining audio queue from current position with new settings
  const regenerateRemainingQueue = useCallback(async (newVoice, newSpeed) => {
    if (!sentencesRef.current.length || !isSpeaking) {
      return;
    }

    // Update current settings
    currentVoiceRef.current = newVoice;
    currentSpeedRef.current = newSpeed;

    // Calculate which sentences need to be regenerated (from next index onwards)
    const nextAudioIndex = currentAudioIndex + 1;
    if (nextAudioIndex >= sentencesRef.current.length) {
      // We're at the last sentence, nothing to regenerate
      return;
    }

    const remainingSentences = sentencesRef.current.slice(nextAudioIndex);

    // Clear the remaining audio queue (keep current and previous)
    const currentAndPreviousAudio = audioQueueRef.current.slice(0, nextAudioIndex);
    audioQueueRef.current = currentAndPreviousAudio;

    // Generate new audio for remaining sentences in background
    try {
      for (let i = 0; i < remainingSentences.length; i++) {
        const sentenceIndex = nextAudioIndex + i;

        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        try {
          console.log(`Regenerating audio for sentence ${sentenceIndex + 1}/${sentencesRef.current.length} with speed ${newSpeed}`);
          const audioUrl = await generateAudioForSentence(remainingSentences[i], newVoice, newSpeed);

          // Add to queue at the correct position
          audioQueueRef.current[sentenceIndex] = audioUrl;
          console.log(`Regenerated audio ${sentenceIndex} with new speed. Queue length: ${audioQueueRef.current.length}`);
        } catch (error) {
          if (error.name === 'AbortError') {
            console.log(`Audio regeneration cancelled for sentence ${sentenceIndex + 1}`);
            break;
          } else {
            console.error(`Failed to regenerate audio for sentence ${sentenceIndex + 1}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error regenerating audio queue:', error);
    }
  }, [currentAudioIndex, isSpeaking, generateAudioForSentence]);

  // Handle audio ended event
  const handleAudioEnded = useCallback(() => {
    // Prevent multiple simultaneous calls or conflicts with navigation
    if (isProcessingEndRef.current || isNavigatingRef.current) {
      console.log('handleAudioEnded already processing or navigating, ignoring duplicate call');
      return;
    }
    isProcessingEndRef.current = true;

    // Use a timeout to batch state updates and prevent race conditions
    setTimeout(() => {
      setCurrentAudioIndex(prev => {
        const nextIndex = prev + 1;

        // Only proceed if the current audio has actually finished playing
        if (audioRef.current && audioRef.current.currentTime > 0 && audioRef.current.ended) {
          console.log(`Audio ${prev} finished naturally, moving to ${nextIndex}`);
        } else if (audioRef.current && audioRef.current.currentTime === 0) {
          console.log(`Audio ${prev} ended without playing, moving to ${nextIndex}`);
        } else {
          console.log(`Audio ${prev} interrupted, moving to ${nextIndex}`);
        }

        // Wait for the next audio to be available if we're ahead of generation
        const waitForNext = () => {
          if (nextIndex < audioQueueRef.current.length && audioQueueRef.current[nextIndex]) {
            // Next audio is ready, play it
            setTimeout(() => {
              if (audioRef.current && audioQueueRef.current[nextIndex] && !isNavigatingRef.current) {
                console.log(`Loading audio ${nextIndex}`);
                // Only pause if the audio is actually playing
                if (audioRef.current.readyState > 0 && !audioRef.current.paused) {
                  audioRef.current.pause();
                }
                audioRef.current.src = audioQueueRef.current[nextIndex];
                audioRef.current.currentTime = 0;
                audioRef.current.load();

                // Wait for the audio to be ready before playing
                const tryPlay = () => {
                  if (audioRef.current && audioRef.current.readyState >= 2 && !isPaused) {
                    audioRef.current.play().catch(error => {
                      console.error(`Error playing audio ${nextIndex}:`, error);
                      // Don't recursively call handleAudioEnded, just try the next one
                      if (nextIndex + 1 < audioQueueRef.current.length) {
                        setCurrentAudioIndex(nextIndex + 1);
                      } else {
                        setIsSpeaking(false);
                      }
                    });
                  } else {
                    setTimeout(tryPlay, 50);
                  }
                };
                setTimeout(tryPlay, 50);
              }
            }, 100);
          } else if (nextIndex < totalAudioCount && !abortControllerRef.current?.signal.aborted) {
            // Next audio is still being generated, wait for it
            console.log(`Waiting for audio ${nextIndex} to be generated...`);
            setTimeout(waitForNext, 100);
          } else {
            // We've reached the end or been aborted
            console.log(`Playbook finished. Reached index ${nextIndex} of ${totalAudioCount}`);
            setIsSpeaking(false);
            setTotalAudioCount(0);
            // Clean up all blob URLs
            audioQueueRef.current.forEach(url => URL.revokeObjectURL(url));
            audioQueueRef.current = [];

            // Check if we finished naturally (not aborted) and call auto-advance callback
            if (!abortControllerRef.current?.signal.aborted && onAutoAdvance) {
              console.log('Playback finished naturally, calling auto-advance callback');
              onAutoAdvance();
            }
          }
        };

        waitForNext();
        return nextIndex;
      });

      // Reset the processing flag after all operations complete
      setTimeout(() => {
        isProcessingEndRef.current = false;
      }, 200);
    }, 10);
  }, [totalAudioCount, isPaused]);

  // Pause speaking function
  const pauseSpeaking = useCallback(() => {
    if (audioRef.current && isSpeaking && !isPaused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  // Resume speaking function
  const resumeSpeaking = useCallback(() => {
    if (audioRef.current && isSpeaking && isPaused) {
      audioRef.current.play().catch(error => {
        console.error('Error resuming audio:', error);
      });
      setIsPaused(false);
    }
  }, [isSpeaking, isPaused]);

  // Fast-forward to next sentence
  const fastForward = useCallback(() => {
    if (isSpeaking && currentAudioIndex < totalAudioCount - 1 && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      setCurrentAudioIndex(prev => {
        const nextIndex = prev + 1;
        if (nextIndex < audioQueueRef.current.length && audioQueueRef.current[nextIndex]) {
          // Next audio is available, play it immediately
          setTimeout(() => {
            if (audioRef.current && !isProcessingEndRef.current) {
              // Don't call pause if audio element is already paused or loading
              if (audioRef.current.readyState > 0 && !audioRef.current.paused) {
                audioRef.current.pause();
              }
              audioRef.current.src = audioQueueRef.current[nextIndex];
              audioRef.current.currentTime = 0;
              audioRef.current.load();

              const tryPlay = () => {
                if (audioRef.current && audioRef.current.readyState >= 2 && !isPaused) {
                  audioRef.current.play().catch(error => {
                    console.error('Error fast-forwarding:', error);
                  });
                }
                isNavigatingRef.current = false;
              };

              if (audioRef.current.readyState >= 2) {
                tryPlay();
              } else {
                setTimeout(tryPlay, 50);
              }
            } else {
              isNavigatingRef.current = false;
            }
          }, 10);
        } else {
          isNavigatingRef.current = false;
        }
        return nextIndex;
      });
    }
  }, [isSpeaking, currentAudioIndex, totalAudioCount, isPaused]);

  // Rewind to previous sentence
  const rewind = useCallback(() => {
    if (isSpeaking && currentAudioIndex > 0 && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      setCurrentAudioIndex(prev => {
        const prevIndex = prev - 1;
        if (audioQueueRef.current[prevIndex]) {
          // Previous audio is available, play it immediately
          setTimeout(() => {
            if (audioRef.current && !isProcessingEndRef.current) {
              // Don't call pause if audio element is already paused or loading
              if (audioRef.current.readyState > 0 && !audioRef.current.paused) {
                audioRef.current.pause();
              }
              audioRef.current.src = audioQueueRef.current[prevIndex];
              audioRef.current.currentTime = 0;
              audioRef.current.load();

              const tryPlay = () => {
                if (audioRef.current && audioRef.current.readyState >= 2 && !isPaused) {
                  audioRef.current.play().catch(error => {
                    console.error('Error rewinding:', error);
                  });
                }
                isNavigatingRef.current = false;
              };

              if (audioRef.current.readyState >= 2) {
                tryPlay();
              } else {
                setTimeout(tryPlay, 50);
              }
            } else {
              isNavigatingRef.current = false;
            }
          }, 10);
        } else {
          isNavigatingRef.current = false;
        }
        return prevIndex;
      });
    }
  }, [isSpeaking, currentAudioIndex, isPaused]);

  // Stop speaking function
  const stopSpeaking = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null; // Clear the reference
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
    audioQueueRef.current = [];
    sentencesRef.current = [];
    currentVoiceRef.current = '';
    currentSpeedRef.current = 1.0;
    isProcessingEndRef.current = false; // Reset the processing flag
    isNavigatingRef.current = false; // Reset the navigation flag
    setTotalAudioCount(0);
    setCurrentAudioIndex(0);
    setIsSpeaking(false);
    setIsPaused(false);
    setIsLoadingAudio(false);
  }, []); // Remove dependencies to make it stable

  // Start speaking function
  const speakText = useCallback(async (text, voice = 'mia', speed = 1.0) => {
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

      const audioUrls = await generateAudioQueue(text, voice, speed);

      if (audioUrls.length > 0 && abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        setTimeout(() => {
          if (audioRef.current && audioQueueRef.current[0]) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = audioQueueRef.current[0];
            audioRef.current.load();
            audioRef.current.play().catch(error => {
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
    // Capture the current audio element at effect runtime
    const currentAudio = audioRef.current;

    return () => {
      // Only cleanup on unmount, use stopSpeaking for other cases
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
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

  // Handle speed changes during playback
  const handleSpeedChange = useCallback(async (newSpeed) => {
    if (!isSpeaking) {
      // Just update the current speed for next playback
      currentSpeedRef.current = newSpeed;
      return;
    }

    // Regenerate remaining queue with new speed
    await regenerateRemainingQueue(currentVoiceRef.current, newSpeed);
  }, [isSpeaking, regenerateRemainingQueue]);

  // Handle voice changes during playback
  const handleVoiceChange = useCallback(async (newVoice) => {
    if (!isSpeaking) {
      // Just update the current voice for next playback
      currentVoiceRef.current = newVoice;
      return;
    }

    // Regenerate remaining queue with new voice
    await regenerateRemainingQueue(newVoice, currentSpeedRef.current);
  }, [isSpeaking, regenerateRemainingQueue]);

  return {
    isSpeaking,
    isPaused,
    isLoadingAudio,
    totalAudioCount,
    currentAudioIndex,
    audioRef,
    speakText,
    pauseSpeaking,
    resumeSpeaking,
    fastForward,
    rewind,
    stopSpeaking,
    handleAudioEnded,
    handleSpeedChange,
    handleVoiceChange
  };
};
