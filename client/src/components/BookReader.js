import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('mia');
  const [audioQueue, setAudioQueue] = useState([]);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);

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

  const stopSpeaking = useCallback(() => {
    // Abort any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Clean up audio queue
    audioQueue.forEach(url => URL.revokeObjectURL(url));
    setAudioQueue([]);
    setCurrentAudioIndex(0);
    setIsSpeaking(false);
    setIsLoadingAudio(false);
  }, [audioQueue]);

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

  // Split text into sentences for faster streaming
  const splitIntoSentences = (text) => {
    // Split by sentence-ending punctuation followed by whitespace and capital letter
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Process sentences to ensure reasonable length (split only very long ones)
    const processedSentences = [];
    sentences.forEach((sentence) => {
      // Only split extremely long sentences (over 400 characters) at natural breaks
      if (sentence.length > 400) {
        // Split at semicolons or em-dashes first
        const majorBreaks = sentence.split(/[;—]\s+/);
        majorBreaks.forEach((part, index) => {
          if (index < majorBreaks.length - 1) {
            part += ';'; // Add back the semicolon
          }

          if (part.length > 300) {
            // Only then split at commas if still too long
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
  };

  // Generate audio for a single sentence
  const generateAudioForSentence = async (text, voice) => {
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
  };

  // Generate audio for all sentences with streaming playback
  const generateAudioQueue = async (text, voice) => {
    const sentences = splitIntoSentences(text);
    console.log(`Total sentences to process: ${sentences.length}`);

    if (sentences.length === 0) {
      console.warn('No sentences found in text content');
      return [];
    }

    const audioUrls = [];
    setIsLoadingAudio(true);

    try {
      // Generate first few sentences immediately to start playback quickly
      const initialBatch = Math.min(3, sentences.length);

      for (let i = 0; i < initialBatch; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const audioUrl = await generateAudioForSentence(sentences[i], voice);
        audioUrls.push(audioUrl);
        console.log(`Generated audio for sentence ${i + 1}/${sentences.length}: "${sentences[i].substring(0, 50)}..."`);
      }

      // Start playback with initial batch
      if (audioUrls.length > 0) {
        setAudioQueue([...audioUrls]);
        setIsLoadingAudio(false);

        // Continue generating remaining sentences in background
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
                // Continue with next sentence instead of stopping
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
  };


  // Handle audio ended event
  const handleAudioEnded = () => {
    setCurrentAudioIndex(prev => {
      const nextIndex = prev + 1;
      if (nextIndex < audioQueue.length) {
        // Play next audio with proper loading
        setTimeout(() => {
          if (audioRef.current && audioQueue[nextIndex]) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = audioQueue[nextIndex];
            audioRef.current.load();
            audioRef.current.play().catch(error => {
              console.error('Audio play error:', error);
              // Try to continue with next audio
              handleAudioEnded();
            });
          }
        }, 50);
      } else {
        // End of queue
        setIsSpeaking(false);
        setAudioQueue([]);
        // Clean up object URLs
        audioQueue.forEach(url => URL.revokeObjectURL(url));
      }
      return nextIndex;
    });
  };

  // Start speaking with TTS server
  const speakText = async () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    if (!chapterTextContent.trim()) {
      alert('No text content available for speech');
      return;
    }

    try {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      setIsSpeaking(true);
      setCurrentAudioIndex(0);

      // Generate audio queue
      const audioUrls = await generateAudioQueue(chapterTextContent, selectedVoice);

      if (audioUrls.length > 0 && !abortControllerRef.current.signal.aborted) {
        // Start playing first audio
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
      console.error('TTS Error:', error);
      setIsSpeaking(false);
      setIsLoadingAudio(false);

      if (error.name === 'AbortError') {
        alert('Speech generation was cancelled');
      } else if (error.message.includes('TTS API error')) {
        alert('TTS server error. Make sure the TTS server is running on port 5005.');
      } else {
        alert(`Speech generation failed: ${error.message}`);
      }
    }
  };


  const goBackToTOC = () => {
    stopSpeaking();
    // Reset reading state when going back to TOC
    setIsReading(false);
    setCurrentChapter(null);
    setChapterContent('');
    setChapterTextContent('');
    // Force navigation by using replace to ensure clean state
    navigate(`/book/${encodeURIComponent(filename)}`, { replace: true });
  };

  const getCurrentChapterIndex = () => {
    if (!currentChapter) return -1;
    return chapters.findIndex(ch => ch.id === currentChapter.id);
  };

  const goToPreviousChapter = () => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex > 0) {
      stopSpeaking();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex - 1].id}`);
    }
  };

  const goToNextChapter = () => {
    const currentIndex = getCurrentChapterIndex();
    if (currentIndex < chapters.length - 1) {
      stopSpeaking();
      navigate(`/book/${encodeURIComponent(filename)}/chapter/${chapters[currentIndex + 1].id}`);
    }
  };

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

  // Cleanup on unmount
  useEffect(() => {
    const currentAudio = audioRef.current;
    const currentAbortController = abortControllerRef.current;

    return () => {
      // Abort any ongoing requests
      if (currentAbortController) {
        currentAbortController.abort();
      }

      // Stop current audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      // Clean up audio queue
      audioQueue.forEach(url => URL.revokeObjectURL(url));
    };
  }, [audioQueue]);

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
              onClick={speakText}
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
              setIsSpeaking(false);
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
                key={chapter.id}
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
