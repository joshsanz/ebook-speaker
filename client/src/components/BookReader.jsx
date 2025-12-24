import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTTS } from '../hooks/useTTS';
import { useCleanup } from '../hooks/useCleanup';
import { useVoices } from '../hooks/useVoices';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useBookData } from '../hooks/useBookData';
import { useChapterNavigation } from '../hooks/useChapterNavigation';
import { useAutoAdvance } from '../hooks/useAutoAdvance';
import { useSentenceHighlighting } from '../hooks/useSentenceHighlighting';
import FloatingControls from './FloatingControls.jsx';
import ChapterNavigation from './ChapterNavigation.jsx';
import TableOfContents from './TableOfContents.jsx';
import ScrollToTopButton from './ScrollToTopButton.jsx';
import { ErrorDisplay, LoadingDisplay } from './ErrorBoundary.jsx';
import { STORAGE_KEYS, DEFAULT_VALUES, ERROR_MESSAGES } from '../constants/bookReader';
import logger from '../utils/logger';
import './BookReader.css';

/**
 * BookReader component for reading and listening to EPUB books
 */
const BookReader = () => {
  const { filename, chapterId } = useParams();
  const [isReading, setIsReading] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  
  // Custom hooks for state management
  const { 
    book, chapters, currentChapter, chapterContent, chapterTextContent, ttsSentences,
    loading, error, fetchBookData, fetchChapterContent, resetChapterState, setError 
  } = useBookData(filename);
  
  const { addCleanup, executeCleanup } = useCleanup();
  
  const [selectedVoice, setSelectedVoice] = useLocalStorage(
    STORAGE_KEYS.SELECTED_VOICE, 
    DEFAULT_VALUES.VOICE
  );

  const [selectedModel, setSelectedModel] = useLocalStorage(
    STORAGE_KEYS.SELECTED_MODEL,
    DEFAULT_VALUES.MODEL
  );

  const [selectedSpeed, setSelectedSpeed] = useLocalStorage(
    STORAGE_KEYS.SELECTED_SPEED, 
    DEFAULT_VALUES.SPEED,
    (value) => parseFloat(value)
  );
  
  const { autoAdvanceEnabled, autoStartTTS, setAutoStartTTS, handleAutoAdvance, toggleAutoAdvance } = 
    useAutoAdvance(filename, chapters, currentChapter);

  // Navigation and TTS hooks
  const {
    getCurrentChapterIndex, goBackToTOC, goToPreviousChapter, 
    goToNextChapter, handleInternalLinkClick
  } = useChapterNavigation(filename, chapters, currentChapter, () => stopSpeaking(), executeCleanup);

  // TTS and voices hooks
  const {
    isSpeaking, isPaused, isLoadingAudio, totalAudioCount, currentAudioIndex,
    audioRef, speakText, pauseSpeaking, resumeSpeaking, fastForward, 
    rewind, stopSpeaking, handleAudioEnded, handleSpeedChange, handleVoiceChange,
    handleModelChange
  } = useTTS(handleAutoAdvance, filename);

  
  const {
    voices, groupedVoices, loading: voicesLoading, 
    error: voicesError, getDefaultVoice
  } = useVoices(selectedModel);

  // Sentence highlighting hook
  const { highlightSentence, clearHighlight, clearAllHighlights } = useSentenceHighlighting();
  const lastPrefetchIndexRef = useRef(-1);

  const enqueueChapterQueue = useCallback(async (targetChapterId) => {
    if (!filename || !targetChapterId || !selectedVoice) {
      return;
    }

    try {
      await fetch('/api/tts/queue/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: filename,
          chapterId: targetChapterId,
          model: selectedModel,
          voice: selectedVoice,
          speed: selectedSpeed
        })
      });
    } catch (error) {
      logger.warn('Failed to enqueue chapter TTS jobs:', error);
    }
  }, [filename, selectedModel, selectedVoice, selectedSpeed]);

  const enqueuePrefetchQueue = useCallback(async (startIndex) => {
    if (!filename || !chapterId || !selectedVoice) {
      return;
    }

    try {
      await fetch('/api/tts/queue/prefetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: filename,
          chapterId: chapterId,
          startIndex,
          model: selectedModel,
          voice: selectedVoice,
          speed: selectedSpeed
        })
      });
    } catch (error) {
      logger.warn('Failed to enqueue prefetch TTS jobs:', error);
    }
  }, [filename, chapterId, selectedModel, selectedVoice, selectedSpeed]);

  const resetPrefetchTracking = useCallback(() => {
    lastPrefetchIndexRef.current = -1;
  }, []);

  // Content is already sanitized on the server before sentence spans are added
  // No need for additional client-side sanitization that could break sentence highlighting
  const sanitizedChapterContent = chapterContent || '';


  /**
   * Handles speak/pause button clicks
   * Toggles between play/pause when speaking, or starts TTS when stopped
   */
  const handleSpeakClick = useCallback(async () => {
    if (isSpeaking) {
      if (isPaused) {
        resumeSpeaking();
      } else {
        pauseSpeaking();
      }
      return;
    }

    if (!ttsSentences || ttsSentences.length === 0) {
      alert(ERROR_MESSAGES.NO_TEXT_CONTENT);
      return;
    }

    try {
      await speakText(ttsSentences, selectedVoice, selectedSpeed, selectedModel);
    } catch (error) {
      logger.error('TTS Error:', error);
      
      let errorMessage = ERROR_MESSAGES.SPEECH_FAILED;
      if (error.name === 'AbortError') {
        errorMessage = ERROR_MESSAGES.SPEECH_CANCELLED;
      } else if (error.message.includes('TTS API error')) {
        errorMessage = ERROR_MESSAGES.TTS_SERVER_ERROR;
      } else {
        errorMessage = `${ERROR_MESSAGES.SPEECH_FAILED}: ${error.message}`;
      }
      
      alert(errorMessage);
    }
  }, [isSpeaking, isPaused, ttsSentences, speakText, selectedVoice, selectedSpeed, selectedModel, pauseSpeaking, resumeSpeaking]);






  /**
   * Handles voice selection changes and updates TTS engine
   */
  const handleVoiceSelectionChange = useCallback(async (newVoice) => {
    setSelectedVoice(newVoice);
    await handleVoiceChange(newVoice);
    if (chapterId) {
      resetPrefetchTracking();
      enqueueChapterQueue(chapterId);
    }
  }, [handleVoiceChange, setSelectedVoice, chapterId, resetPrefetchTracking, enqueueChapterQueue]);

  /**
   * Handles model selection changes and updates TTS engine
   */
  const handleModelSelectionChange = useCallback(async (newModel) => {
    setSelectedModel(newModel);
    stopSpeaking();
    await handleModelChange(newModel);
    if (chapterId) {
      resetPrefetchTracking();
      enqueueChapterQueue(chapterId);
    }
  }, [handleModelChange, setSelectedModel, stopSpeaking, chapterId, resetPrefetchTracking, enqueueChapterQueue]);

  /**
   * Handles speed selection changes and updates TTS engine
   */
  const handleSpeedSelectionChange = useCallback(async (newSpeed) => {
    setSelectedSpeed(newSpeed);
    await handleSpeedChange(newSpeed);
    if (chapterId) {
      resetPrefetchTracking();
      enqueueChapterQueue(chapterId);
    }
  }, [handleSpeedChange, setSelectedSpeed, chapterId, resetPrefetchTracking, enqueueChapterQueue]);




  // Reset state when navigating between routes
  useEffect(() => {
    stopSpeaking();
    executeCleanup();

    // Reset chapter-specific state when going back to TOC
    if (!chapterId) {
      setIsReading(false);
      resetChapterState();
    }

    setError(null);
  }, [filename, chapterId, stopSpeaking, executeCleanup, resetChapterState, setError]);

  // Fetch book data on mount
  useEffect(() => {
    fetchBookData();
  }, [fetchBookData]);

  // Fetch chapter content when chapterId changes
  useEffect(() => {
    if (chapterId && chapters.length > 0) {
      fetchChapterContent(chapterId).then(() => {
        setIsReading(true);
        resetPrefetchTracking();
        enqueueChapterQueue(chapterId);
        // Scroll to top when chapter content loads
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [chapterId, chapters, fetchChapterContent]);

  // Auto-start TTS when chapter content is loaded and autoStartTTS is true
  useEffect(() => {
    if (autoStartTTS && ttsSentences && ttsSentences.length > 0 && !isSpeaking && !isLoadingAudio && !loading) {
      logger.info('Auto-starting TTS after chapter advance');

      const timer = setTimeout(async () => {
        try {
          await speakText(ttsSentences, selectedVoice, selectedSpeed, selectedModel);
          logger.info('TTS auto-started successfully');
        } catch (error) {
          logger.error('Error auto-starting TTS:', error);
        }
        setAutoStartTTS(false);
      }, DEFAULT_VALUES.AUTO_START_DELAY);

      return () => clearTimeout(timer);
    }
  }, [autoStartTTS, ttsSentences, isSpeaking, isLoadingAudio, loading, speakText, selectedVoice, selectedSpeed, selectedModel, setAutoStartTTS]);

  useEffect(() => {
    if (!isSpeaking || !chapterId) {
      return;
    }

    if (currentAudioIndex <= lastPrefetchIndexRef.current) {
      return;
    }

    lastPrefetchIndexRef.current = currentAudioIndex;
    enqueuePrefetchQueue(currentAudioIndex);
  }, [isSpeaking, currentAudioIndex, chapterId, enqueuePrefetchQueue]);


  // Set default voice when voices are loaded
  useEffect(() => {
    if (voices.length === 0) {
      return;
    }

    const voiceNames = new Set(voices.map((voice) => voice.name));
    if (!voiceNames.has(selectedVoice)) {
      const defaultVoice = getDefaultVoice();
      if (defaultVoice) {
        setSelectedVoice(defaultVoice);
      }
    } else if (selectedVoice === DEFAULT_VALUES.VOICE) {
      const defaultVoice = getDefaultVoice();
      if (defaultVoice && defaultVoice !== selectedVoice) {
        setSelectedVoice(defaultVoice);
      }
    }
  }, [voices, getDefaultVoice, selectedVoice, setSelectedVoice]);


  // Add TTS cleanup to cleanup manager
  useEffect(() => {
    addCleanup(stopSpeaking);
    addCleanup(clearAllHighlights);
    return executeCleanup;
  }, [addCleanup, stopSpeaking, executeCleanup, clearAllHighlights]);

  // Sync sentence highlighting with TTS playback
  useEffect(() => {
    if (isSpeaking && !isPaused && currentAudioIndex >= 0) {
      // Use requestAnimationFrame to throttle highlighting updates
      const rafId = requestAnimationFrame(() => {
        highlightSentence(currentAudioIndex);
      });
      return () => cancelAnimationFrame(rafId);
    } else if (!isSpeaking) {
      clearHighlight();
    }
  }, [currentAudioIndex, isSpeaking, isPaused, highlightSentence, clearHighlight]);

  if (loading) {
    return <LoadingDisplay />;
  }

  if (error) {
    return (
      <ErrorDisplay 
        error={error} 
        onRetry={() => {
          setError(null);
          if (chapterId && chapters.length > 0) {
            fetchChapterContent(chapterId);
          } else {
            fetchBookData();
          }
        }}
        showBackLink
      />
    );
  }

  if (isReading && currentChapter) {
    return (
      <div className="book-reader-container">
        <FloatingControls
          controlsHidden={controlsHidden}
          setControlsHidden={setControlsHidden}
          autoAdvanceEnabled={autoAdvanceEnabled}
          handleAutoAdvanceToggle={toggleAutoAdvance}
          selectedModel={selectedModel}
          handleModelSelectionChange={handleModelSelectionChange}
          voices={voices}
          groupedVoices={groupedVoices}
          selectedVoice={selectedVoice}
          handleVoiceSelectionChange={handleVoiceSelectionChange}
          voicesLoading={voicesLoading}
          voicesError={voicesError}
          selectedSpeed={selectedSpeed}
          handleSpeedSelectionChange={handleSpeedSelectionChange}
          isLoadingAudio={isLoadingAudio}
          isSpeaking={isSpeaking}
          isPaused={isPaused}
          currentAudioIndex={currentAudioIndex}
          totalAudioCount={totalAudioCount}
          handleSpeakClick={handleSpeakClick}
          rewind={rewind}
          fastForward={fastForward}
          stopSpeaking={stopSpeaking}
        />

        <div className="reader-header">
          <button onClick={goBackToTOC} className="back-button">
            ← Back to Table of Contents
          </button>
          <h2>{currentChapter.title}</h2>
        </div>

        <ChapterNavigation
          goToPreviousChapter={goToPreviousChapter}
          goBackToTOC={goBackToTOC}
          goToNextChapter={goToNextChapter}
          getCurrentChapterIndex={getCurrentChapterIndex}
          chapters={chapters}
          className="chapter-navigation-top"
        />

        <div className="chapter-content" onClick={handleInternalLinkClick}>
          <div dangerouslySetInnerHTML={{ __html: sanitizedChapterContent }} />
        </div>

        <ChapterNavigation
          goToPreviousChapter={goToPreviousChapter}
          goBackToTOC={goBackToTOC}
          goToNextChapter={goToNextChapter}
          getCurrentChapterIndex={getCurrentChapterIndex}
          chapters={chapters}
          className="chapter-navigation-bottom"
        />

        {/* Hidden audio element for playback */}
        <audio
          key="tts-audio-player"
          ref={audioRef}
          onEnded={handleAudioEnded}
          onError={(e) => {
            // Try to continue with next audio instead of stopping completely
            if (isSpeaking && currentAudioIndex + 1 < totalAudioCount) {
              handleAudioEnded();
            } else {
              stopSpeaking();
            }
          }}
          style={{ display: 'none' }}
          preload="none"
        />

        {/* Scroll to top button */}
        <ScrollToTopButton />
      </div>
    );
  }


  return (
    <div className="book-reader-container">
      <div className="book-header">
        <Link to="/" className="back-link">← Back to Book List</Link>
        {book && (
          <div className="book-metadata">
            <h1>{book.title}</h1>
            {book.author && <p className="author">by {book.author}</p>}
            {book.publisher && <p className="publisher">{book.publisher}</p>}
            {book.date && <p className="date">{new Date(book.date).getFullYear()}</p>}
          </div>
        )}
      </div>

      <TableOfContents chapters={chapters} filename={filename} />
    </div>
  );
};

export default BookReader;
