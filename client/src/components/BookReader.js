import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTTS } from '../hooks/useTTS';
import { useCleanup } from '../hooks/useCleanup';
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
  const [selectedVoice, setSelectedVoice] = useState('mia');

  // Use custom hooks for TTS and cleanup
  const {
    isSpeaking,
    isLoadingAudio,
    audioQueue,
    currentAudioIndex,
    audioRef,
    speakText,
    stopSpeaking,
    handleAudioEnded
  } = useTTS();
  
  const { addCleanup, executeCleanup } = useCleanup();

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






  // Handle speak button click
  const handleSpeakClick = async () => {
    if (!chapterTextContent.trim()) {
      alert('No text content available for speech');
      return;
    }

    try {
      await speakText(chapterTextContent, selectedVoice);
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
  }, [stopSpeaking, executeCleanup, navigate, filename]);

  const getCurrentChapterIndex = useCallback(() => {
    if (!currentChapter) return -1;
    return chapters.findIndex(ch => ch.id === currentChapter.id);
  }, [currentChapter, chapters]);

  const goToPreviousChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex > 0) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex - 1].id}`);
    }
  }, [getCurrentChapterIndex, stopSpeaking, executeCleanup, navigate, filename, chapters]);

  const goToNextChapter = useCallback(() => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex < chapters.length - 1) {
      stopSpeaking();
      executeCleanup();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
    }
  }, [getCurrentChapterIndex, stopSpeaking, executeCleanup, navigate, filename, chapters]);

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
  }, [filename, chapterId, stopSpeaking, executeCleanup]);

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

  console.log('BookReader render - loading:', loading, 'error:', error, 'isReading:', isReading, 'currentChapter:', currentChapter, 'chapterId:', chapterId);

  if (loading) {
    console.log('Rendering loading state');
    return (
      <div className="book-reader-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    console.log('Rendering error state:', error);
    return (
      <div className="book-reader-container">
        <div className="error">Error: {error}</div>
        <Link to="/" className="back-link">← Back to Book List</Link>
      </div>
    );
  }

  if (isReading && currentChapter) {
    console.log('Rendering chapter view for:', currentChapter.title);
    return (
      <div className="book-reader-container">
        <div className="reader-header">
          <button onClick={goBackToTOC} className="back-button">
            ← Back to Table of Contents
          </button>
          <h2>{currentChapter.title}</h2>
          <div className="reader-controls">
            <div className="voice-selection">
              <label htmlFor="voice-select">Voice:</label>
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={isSpeaking || isLoadingAudio}
                className="voice-dropdown"
              >
                <option value="tara">Tara</option>
                <option value="leah">Leah</option>
                <option value="jess">Jess</option>
                <option value="leo">Leo</option>
                <option value="dan">Dan</option>
                <option value="mia">Mia</option>
                <option value="zac">Zac</option>
                <option value="zoe">Zoe</option>
              </select>
            </div>

            <button
              onClick={handleSpeakClick}
              disabled={isLoadingAudio}
              className={`speak-button ${isSpeaking ? 'speaking' : ''} ${isLoadingAudio ? 'loading' : ''}`}
            >
              {isLoadingAudio ? '⏳ Loading...' : isSpeaking ? '⏸️ Pause' : '🔊 Speak'}
            </button>

            {(isSpeaking || isLoadingAudio) && (
              <button onClick={stopSpeaking} className="stop-button">
                ⏹️ Stop
              </button>
            )}

            {isSpeaking && audioQueue.length > 0 && (
              <div className="audio-progress">
                {currentAudioIndex + 1} / {audioQueue.length}
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

        <div className="chapter-content">
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
          ref={audioRef}
          onEnded={handleAudioEnded}
          onError={(e) => {
            console.error('Audio playback error:', e);
            // Try to continue with next audio instead of stopping completely
            if (isSpeaking && currentAudioIndex + 1 < audioQueue.length) {
              handleAudioEnded();
            } else {
              stopSpeaking();
            }
          }}
          onLoadStart={() => {
            console.log('Audio loading started');
          }}
          onCanPlay={() => {
            console.log('Audio can play');
          }}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  console.log('Rendering TOC view - chapters:', chapters.length, 'book:', book?.title);
  
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
                onClick={() => {
                  console.log('Chapter clicked:', chapter.id);
                  navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapter.id}`);
                }}
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
