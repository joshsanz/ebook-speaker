import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTTS } from '../hooks/useTTS';
import { useCleanup } from '../hooks/useCleanup';
import { useVoices } from '../hooks/useVoices';
import VoiceSelector from './VoiceSelector.jsx';
import SpeedSelector from './SpeedSelector.jsx';
import './BookReader.css';

const BookReader = () => {
  const { filename, chapterId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterContent, setChapterContent] = useState('');
  const [chapterTextContent, setChapterTextContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(() => {
    const saved = localStorage.getItem('ebook-speaker-selected-voice');
    return saved || 'af_heart';
  });
  const [selectedSpeed, setSelectedSpeed] = useState(() => {
    const saved = localStorage.getItem('ebook-speaker-selected-speed');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
  const [shouldAutoAdvance, setShouldAutoAdvance] = useState(false);
  const [autoStartTTS, setAutoStartTTS] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  // Auto-advance callback function (defined early for useTTS hook)
  const handleAutoAdvance = useCallback(() => {
    if (autoAdvanceEnabled && chapters.length > 0 && currentChapter) {
      // Get current chapter index inline to avoid dependency issues
      let currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
      if (currentIndex === -1) {
        // Fallback to order-based lookup
        currentIndex = chapters.findIndex(ch => ch.order === currentChapter.order);
      }

      if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
        console.log('Auto-advancing to next chapter');
        // Set flags for navigation and auto-start
        setShouldAutoAdvance(true);
        setAutoStartTTS(true); // Persistent flag that survives navigation
      }
    }
  }, [autoAdvanceEnabled, chapters, currentChapter]);

  // Handle auto-advance navigation in useEffect to avoid render-time navigation
  useEffect(() => {
    if (shouldAutoAdvance && currentChapter) {
      let currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
      if (currentIndex === -1) {
        // Fallback to order-based lookup
        currentIndex = chapters.findIndex(ch => ch.order === currentChapter.order);
      }

      if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
        navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
      }
      setShouldAutoAdvance(false); // Reset the flag
    }
  }, [shouldAutoAdvance, currentChapter, chapters, filename, navigate]);

  // Use custom hooks for TTS and cleanup
  const {
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
  } = useTTS(handleAutoAdvance);

  const { addCleanup, executeCleanup } = useCleanup();

  // Use voices hook
  const {
    voices,
    groupedVoices,
    loading: voicesLoading,
    error: voicesError,
    getDefaultVoice
  } = useVoices();

  const fetchBookData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch book metadata
      const metadataResponse = await fetch(`/api/books/${encodeURIComponent(filename)}/metadata`);
      if (!metadataResponse.ok) {
        throw new Error('Failed to fetch book metadata');
      }
      const metadata = await metadataResponse.json();
      setBook(metadata);

      // Fetch chapters
      const chaptersResponse = await fetch(`/api/books/${encodeURIComponent(filename)}/chapters`);
      if (!chaptersResponse.ok) {
        throw new Error('Failed to fetch chapters');
      }
      const chaptersData = await chaptersResponse.json();
      setChapters(chaptersData);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filename]);


  const fetchChapterContent = useCallback(async (chapterId) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/books/${encodeURIComponent(filename)}/chapters/${chapterId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch chapter content');
      }
      const data = await response.json();
      setChapterContent(data.content);  // HTML content for display
      setChapterTextContent(data.textContent);  // Clean text for speech
      setCurrentChapter(chapters.find(ch => ch.id === chapterId));
      setIsReading(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filename, chapters]);






  // Handle voice selection changes
  const handleVoiceSelectionChange = useCallback(async (newVoice) => {
    setSelectedVoice(newVoice);
    await handleVoiceChange(newVoice);
  }, [handleVoiceChange]);

  // Handle speed selection changes
  const handleSpeedSelectionChange = useCallback(async (newSpeed) => {
    setSelectedSpeed(newSpeed);
    await handleSpeedChange(newSpeed);
  }, [handleSpeedChange]);

  // Handle speak/pause button click
  const handleSpeakClick = async () => {
    // If currently speaking, toggle pause/resume
    if (isSpeaking) {
      if (isPaused) {
        resumeSpeaking();
      } else {
        pauseSpeaking();
      }
      return;
    }

    // If not speaking, start speaking
    if (!chapterTextContent.trim()) {
      alert('No text content available for speech');
      return;
    }

    try {
      await speakText(chapterTextContent, selectedVoice, selectedSpeed);
    } catch (error) {
      console.error('TTS Error:', error);

      if (error.name === 'AbortError') {
        alert('Speech generation was cancelled');
      } else if (error.message.includes('TTS API error')) {
        alert('TTS server error. Make sure the TTS server is running on port 5005.');
      } else {
        alert(`Speech generation failed: ${error.message}`);
      }
    }
  };

  // Handle auto-advance toggle
  const handleAutoAdvanceToggle = useCallback(() => {
    const newValue = !autoAdvanceEnabled;
    setAutoAdvanceEnabled(newValue);
    localStorage.setItem('ebook-speaker-auto-advance', JSON.stringify(newValue));
  }, [autoAdvanceEnabled]);


  const goBackToTOC = useCallback(() => {
    // Stop speaking first, then execute other cleanup
    stopSpeaking();
    executeCleanup();

    // Reset reading state when going back to TOC
    setIsReading(false);
    setCurrentChapter(null);
    setChapterContent('');
    setChapterTextContent('');

    // Force navigation by using replace to ensure clean state
    navigate(`/book/${encodeURIComponent(filename)}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, filename]);

  const getCurrentChapterIndex = useCallback(() => {
    if (!currentChapter || !chapters.length) return -1;

    // First try to find by exact ID match
    let index = chapters.findIndex(ch => ch.id === currentChapter.id);

    // If not found, try to find by order number as fallback
    if (index === -1) {
      console.warn(`Chapter ID ${currentChapter.id} not found in chapters list, trying order fallback`);
      index = chapters.findIndex(ch => ch.order === currentChapter.order);
    }

    // If still not found, log warning and return -1
    if (index === -1) {
      console.error(`Could not find current chapter ${currentChapter.title} (ID: ${currentChapter.id}) in chapters list`);
      console.log('Available chapters:', chapters.map(ch => `${ch.order}: ${ch.title} (ID: ${ch.id})`));
    }

    return index;
  }, [currentChapter, chapters]);

  const goToPreviousChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex > 0) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex - 1].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCurrentChapterIndex, navigate, filename, chapters]);

  const goToNextChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex < chapters.length - 1) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCurrentChapterIndex, navigate, filename, chapters]);

  // Handle internal link clicks
  const handleInternalLinkClick = useCallback((event) => {
    const link = event.target.closest('a[data-internal-link="true"]');
    if (!link) return;

    event.preventDefault();

    const chapterId = link.getAttribute('data-chapter-id');
    const fragment = link.getAttribute('data-fragment');

    if (chapterId) {
      // Stop current speech before navigating
      stopSpeaking();
      executeCleanup();

      // Navigate to the new chapter
      const newPath = `/book/${encodeURIComponent(filename)}/chapter/${chapterId}`;

      // Handle fragment navigation after React router navigation completes
      if (fragment) {
        navigate(newPath);
        // Use setTimeout to wait for navigation and DOM update
        setTimeout(() => {
          const targetElement = document.getElementById(fragment);
          if (targetElement) {
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        }, 100);
      } else {
        navigate(newPath);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, filename, stopSpeaking, executeCleanup]);

  // Reset state when navigating between routes
  useEffect(() => {
    // Stop any current speech when navigating
    stopSpeaking();
    executeCleanup();

    // Reset chapter-specific state when going back to TOC
    if (!chapterId) {
      setIsReading(false);
      setCurrentChapter(null);
      setChapterContent('');
      setChapterTextContent('');
    }

    // Reset error state on navigation
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, chapterId]);

  // Fetch book data on mount
  useEffect(() => {
    fetchBookData();
  }, [fetchBookData]);

  // Fetch chapter content when chapterId changes
  useEffect(() => {
    if (chapterId && chapters.length > 0) {
      fetchChapterContent(chapterId);
    }
  }, [chapterId, chapters, fetchChapterContent]);

  // Auto-start TTS when chapter content is loaded and autoStartTTS is true
  useEffect(() => {
    if (autoStartTTS && chapterTextContent && !isSpeaking && !isLoadingAudio && !loading) {
      console.log('Auto-starting TTS after chapter advance', {
        autoStartTTS,
        hasContent: !!chapterTextContent,
        isSpeaking,
        isLoadingAudio,
        loading
      });

      // Add a small delay to ensure cleanup is complete before starting new TTS
      const timer = setTimeout(async () => {
        console.log('Actually calling speakText for auto-advance...');
        try {
          await speakText(chapterTextContent, selectedVoice, selectedSpeed);
          console.log('TTS auto-started successfully');
        } catch (error) {
          console.error('Error auto-starting TTS:', error);
        }
        setAutoStartTTS(false); // Reset the flag
      }, 1000); // 1 second delay to ensure everything is ready

      return () => clearTimeout(timer); // Cleanup timer if component unmounts
    } else if (autoStartTTS) {
      console.log('Auto-start conditions not met:', {
        autoStartTTS,
        hasContent: !!chapterTextContent,
        isSpeaking,
        isLoadingAudio,
        loading
      });
    }
  }, [autoStartTTS, chapterTextContent, isSpeaking, isLoadingAudio, loading, speakText, selectedVoice, selectedSpeed]);

  // Load auto-advance setting from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ebook-speaker-auto-advance');
    if (saved !== null) {
      setAutoAdvanceEnabled(JSON.parse(saved));
    }
  }, []);

  // Set default voice when voices are loaded
  useEffect(() => {
    if (voices.length > 0 && selectedVoice === 'af_heart') {
      const defaultVoice = getDefaultVoice();
      if (defaultVoice && defaultVoice !== selectedVoice) {
        setSelectedVoice(defaultVoice);
      }
    }
  }, [voices, getDefaultVoice, selectedVoice]);

  // Save selected voice to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('ebook-speaker-selected-voice', selectedVoice);
  }, [selectedVoice]);

  // Save selected speed to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('ebook-speaker-selected-speed', selectedSpeed.toString());
  }, [selectedSpeed]);

  // Add TTS cleanup to cleanup manager
  useEffect(() => {
    addCleanup(() => {
      stopSpeaking();
    });
  }, [addCleanup, stopSpeaking]);

  // Cleanup on route change (when chapterId changes)
  useEffect(() => {
    return () => {
      executeCleanup();
    };
  }, [chapterId, executeCleanup]);


  if (loading) {
    return (
      <div className="book-reader-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="book-reader-container">
        <div className="error">Error: {error}</div>
        <Link to="/" className="back-link">← Back to Book List</Link>
      </div>
    );
  }

  if (isReading && currentChapter) {
    return (
      <div className="book-reader-container">
        {/* Floating Audio Controls */}
        <div className={`floating-controls ${controlsHidden ? 'hidden' : ''}`}>
          <div className="floating-controls-content">
            <button
              onClick={() => setControlsHidden(!controlsHidden)}
              className="toggle-controls-button"
              title={controlsHidden ? 'Show controls' : 'Hide controls'}
            >
              {controlsHidden ? '👁️' : '🙈'}
            </button>

            <button
              onClick={handleAutoAdvanceToggle}
              className={`auto-advance-button ${autoAdvanceEnabled ? 'enabled' : 'disabled'}`}
              title={autoAdvanceEnabled ? 'Auto-advance is ON' : 'Auto-advance is OFF'}
            >
              Auto-Advance: {autoAdvanceEnabled ? 'ON' : 'OFF'}
            </button>

            <VoiceSelector
              voices={voices}
              groupedVoices={groupedVoices}
              selectedVoice={selectedVoice}
              onVoiceChange={handleVoiceSelectionChange}
              disabled={isLoadingAudio}
              loading={voicesLoading}
              error={voicesError}
            />

            <SpeedSelector
              selectedSpeed={selectedSpeed}
              onSpeedChange={handleSpeedSelectionChange}
              disabled={isLoadingAudio}
            />

            <div className="controls-spacer"></div>

            <div className="playback-controls-group">
              {isSpeaking && (
                <button
                  onClick={rewind}
                  disabled={currentAudioIndex === 0}
                  className="control-button rewind-button"
                  title="Previous sentence"
                >
                  ⏮️
                </button>
              )}

              <button
                onClick={handleSpeakClick}
                disabled={isLoadingAudio}
                className={`speak-button ${isSpeaking ? 'speaking' : ''} ${isLoadingAudio ? 'loading' : ''} ${isPaused ? 'paused' : ''}`}
              >
                {isLoadingAudio ? '⏳ Loading...' :
                 isSpeaking ? (isPaused ? '▶️ Resume' : '⏸️ Pause') :
                 '🔊 Speak'}
              </button>

              {isSpeaking && (
                <button
                  onClick={fastForward}
                  disabled={currentAudioIndex >= totalAudioCount - 1}
                  className="control-button fast-forward-button"
                  title="Next sentence"
                >
                  ⏭️
                </button>
              )}

              {(isSpeaking || isLoadingAudio) && (
                <button onClick={stopSpeaking} className="stop-button">
                  ⏹️ Stop
                </button>
              )}

              {isSpeaking && totalAudioCount > 0 && (
                <div className="audio-progress">
                  {currentAudioIndex + 1} / {totalAudioCount}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="reader-header">
          <button onClick={goBackToTOC} className="back-button">
            ← Back to Table of Contents
          </button>
          <h2>{currentChapter.title}</h2>
        </div>

        <div className="chapter-navigation-top">
          <button
            onClick={goToPreviousChapter}
            disabled={getCurrentChapterIndex() === 0}
            className="nav-button prev-button"
          >
            ← Previous
          </button>
          <button onClick={goBackToTOC} className="nav-button toc-button">
            📚 Table of Contents
          </button>
          <button
            onClick={goToNextChapter}
            disabled={getCurrentChapterIndex() === chapters.length - 1}
            className="nav-button next-button"
          >
            Next →
          </button>
        </div>

        <div className="chapter-content" onClick={handleInternalLinkClick}>
          <div dangerouslySetInnerHTML={{ __html: chapterContent }} />
        </div>

        <div className="chapter-navigation-bottom">
          <button
            onClick={goToPreviousChapter}
            disabled={getCurrentChapterIndex() === 0}
            className="nav-button prev-button"
          >
            ← Previous
          </button>
          <button onClick={goBackToTOC} className="nav-button toc-button">
            📚 Table of Contents
          </button>
          <button
            onClick={goToNextChapter}
            disabled={getCurrentChapterIndex() === chapters.length - 1}
            className="nav-button next-button"
          >
            Next →
          </button>
        </div>

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

      <div className="table-of-contents">
        <h2>Table of Contents</h2>
        {chapters.length === 0 ? (
          <p>No chapters found in this book.</p>
        ) : (
          <div className="chapters-list">
            {chapters.map((chapter, index) => (
              <button
                key={`${chapter.id}-${index}`}
                onClick={() => navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapter.id}`)}
                className="chapter-item"
              >
                <span className="chapter-number">{index + 1}.</span>
                <span className="chapter-title">{chapter.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BookReader;
