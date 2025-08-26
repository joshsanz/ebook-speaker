import { useState, useCallback } from 'react';
import logger from '../utils/logger';

/**
 * Custom hook for managing book and chapter data
 * @param {string} filename - The book filename
 * @returns {Object} Book data state and functions
 */
export const useBookData = (filename) => {
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterContent, setChapterContent] = useState('');
  const [chapterTextContent, setChapterTextContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBookData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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

      logger.info('Book data loaded successfully', { title: metadata.title, chaptersCount: chaptersData.length });
    } catch (err) {
      logger.error('Error fetching book data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filename]);

  const fetchChapterContent = useCallback(async (chapterId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/books/${encodeURIComponent(filename)}/chapters/${chapterId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch chapter content');
      }
      
      const data = await response.json();
      setChapterContent(data.content);  // HTML content for display
      setChapterTextContent(data.textContent);  // Clean text for speech
      
      const chapter = chapters.find(ch => ch.id === chapterId);
      setCurrentChapter(chapter);
      
      logger.info('Chapter content loaded', { chapterId, title: chapter?.title });
    } catch (err) {
      logger.error('Error fetching chapter content:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filename, chapters]);

  const resetChapterState = useCallback(() => {
    setCurrentChapter(null);
    setChapterContent('');
    setChapterTextContent('');
    setError(null);
  }, []);

  return {
    // State
    book,
    chapters,
    currentChapter,
    chapterContent,
    chapterTextContent,
    loading,
    error,
    
    // Actions
    fetchBookData,
    fetchChapterContent,
    resetChapterState,
    setError
  };
};