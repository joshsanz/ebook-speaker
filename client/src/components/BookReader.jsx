import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { sanitizeForDisplay, isContentSafe } from '../utils/htmlSanitizer';
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
    book, chapters, currentChapter, chapterContent, chapterTextContent, 
    loading, error, fetchBookData, fetchChapterContent, resetChapterState, setError 
  } = useBookData(filename);
  
  const { addCleanup, executeCleanup } = useCleanup();
  
  const [selectedVoice, setSelectedVoice] = useLocalStorage(
    STORAGE_KEYS.SELECTED_VOICE, 
    DEFAULT_VALUES.VOICE
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
    rewind, stopSpeaking, handleAudioEnded, handleSpeedChange, handleVoiceChange
  } = useTTS(handleAutoAdvance);
  
  const {
    voices, groupedVoices, loading: voicesLoading, 
    error: voicesError, getDefaultVoice
  } = useVoices();

  // Sentence highlighting hook
  const { highlightSentence, clearHighlight, clearAllHighlights } = useSentenceHighlighting();

  // SECURITY: Sanitize chapter content to prevent XSS attacks
  const sanitizedChapterContent = useMemo(() => {
    if (!chapterContent) return '';
    
    // Check if content appears to be already safe
    if (!isContentSafe(chapterContent)) {
      logger.warn('Unsafe HTML content detected in chapter, applying client-side sanitization');
    }
    
    // Apply client-side sanitization as defense-in-depth
    return sanitizeForDisplay(chapterContent);
  }, [chapterContent]);

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

    if (!chapterTextContent.trim()) {
      alert(ERROR_MESSAGES.NO_TEXT_CONTENT);
      return;
    }

    try {
      await speakText(chapterTextContent, selectedVoice, selectedSpeed);
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
  }, [isSpeaking, isPaused, chapterTextContent, speakText, selectedVoice, selectedSpeed, pauseSpeaking, resumeSpeaking]);






  /**
   * Handles voice selection changes and updates TTS engine
   */
  const handleVoiceSelectionChange = useCallback(async (newVoice) => {
    setSelectedVoice(newVoice);
    await handleVoiceChange(newVoice);
  }, [handleVoiceChange, setSelectedVoice]);

  /**
   * Handles speed selection changes and updates TTS engine
   */
  const handleSpeedSelectionChange = useCallback(async (newSpeed) => {
    setSelectedSpeed(newSpeed);
    await handleSpeedChange(newSpeed);
  }, [handleSpeedChange, setSelectedSpeed]);




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
        // Scroll to top when chapter content loads
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [chapterId, chapters, fetchChapterContent]);

  // Auto-start TTS when chapter content is loaded and autoStartTTS is true
  useEffect(() => {
    if (autoStartTTS && chapterTextContent && !isSpeaking && !isLoadingAudio && !loading) {
      logger.info('Auto-starting TTS after chapter advance');

      const timer = setTimeout(async () => {
        try {
          await speakText(chapterTextContent, selectedVoice, selectedSpeed);
          logger.info('TTS auto-started successfully');
        } catch (error) {
          logger.error('Error auto-starting TTS:', error);
        }
        setAutoStartTTS(false);
      }, DEFAULT_VALUES.AUTO_START_DELAY);

      return () => clearTimeout(timer);
    }
  }, [autoStartTTS, chapterTextContent, isSpeaking, isLoadingAudio, loading, speakText, selectedVoice, selectedSpeed, setAutoStartTTS]);


  // Set default voice when voices are loaded
  useEffect(() => {
    if (voices.length > 0 && selectedVoice === DEFAULT_VALUES.VOICE) {
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
    if (isSpeaking && currentAudioIndex >= 0) {
      highlightSentence(currentAudioIndex);
    } else if (!isSpeaking) {
      // Only clear highlight when TTS is completely stopped, not when paused
      clearHighlight();
    }
    // If paused (isSpeaking=true, isPaused=true), keep the current highlight
  }, [currentAudioIndex, isSpeaking, highlightSentence, clearHighlight]);


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
