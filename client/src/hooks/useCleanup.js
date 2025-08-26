import { useEffect, useRef, useCallback } from 'react';
import logger from '../utils/logger';

export const useCleanup = () => {
  const cleanupFunctionsRef = useRef([]);

  // Add a cleanup function
  const addCleanup = useCallback((cleanupFn) => {
    cleanupFunctionsRef.current.push(cleanupFn);
  }, []);

  // Remove a specific cleanup function
  const removeCleanup = useCallback((cleanupFn) => {
    cleanupFunctionsRef.current = cleanupFunctionsRef.current.filter(fn => fn !== cleanupFn);
  }, []);

  // Execute all cleanup functions immediately
  const executeCleanup = useCallback(() => {
    cleanupFunctionsRef.current.forEach(cleanupFn => {
      try {
        cleanupFn();
      } catch (error) {
        logger.error('Error during cleanup:', error);
      }
    });
    cleanupFunctionsRef.current = [];
  }, []);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      executeCleanup();
    };
  }, [executeCleanup]);

  return {
    addCleanup,
    removeCleanup,
    executeCleanup
  };
};