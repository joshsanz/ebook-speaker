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
  const [selectedVoice, setSelectedVoice] = useState('af_heart');
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);

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
  } = useTTS();

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

  // Set default voice when voices are loaded
  useEffect(() => {
    if (voices.length > 0 && selectedVoice === 'af_heart') {
      const defaultVoice = getDefaultVoice();
      if (defaultVoice && defaultVoice !== selectedVoice) {
        setSelectedVoice(defaultVoice);
      }
    }
  }, [voices, getDefaultVoice, selectedVoice]);

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
        <div className="reader-header">
          <button onClick={goBackToTOC} className="back-button">
            ← Back to Table of Contents
          </button>
          <h2>{currentChapter.title}</h2>
          <div className="reader-controls">
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
