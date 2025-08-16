import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import './BookReader.css';

const BookReader = () => {
  const { filename } = useParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterContent, setChapterContent] = useState('');
  const [chapterTextContent, setChapterTextContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

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

  useEffect(() => {
    fetchBookData();
  }, [fetchBookData]);

  const fetchChapterContent = async (chapterId) => {
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
  };

  const speakText = () => {
    if ('speechSynthesis' in window) {
      // Stop any current speech
      window.speechSynthesis.cancel();

      if (!isSpeaking) {
        const utterance = new SpeechSynthesisUtterance(chapterTextContent);
        utterance.rate = 0.8;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    } else {
      alert('Text-to-speech is not supported in your browser');
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const goBackToTOC = () => {
    setIsReading(false);
    setCurrentChapter(null);
    setChapterContent('');
    stopSpeaking();
  };

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
            <button
              onClick={speakText}
              className={`speak-button ${isSpeaking ? 'speaking' : ''}`}
            >
              {isSpeaking ? '⏸️ Pause' : '🔊 Speak'}
            </button>
            {isSpeaking && (
              <button onClick={stopSpeaking} className="stop-button">
                ⏹️ Stop
              </button>
            )}
          </div>
        </div>

        <div className="chapter-content">
          <div dangerouslySetInnerHTML={{ __html: chapterContent }} />
        </div>
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
                onClick={() => fetchChapterContent(chapter.id)}
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
