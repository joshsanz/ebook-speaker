import { useEffect, useRef } from 'react';

export const useCleanup = () => {
  const cleanupFunctionsRef = useRef([]);

  // Add a cleanup function
  const addCleanup = (cleanupFn) => {
    cleanupFunctionsRef.current.push(cleanupFn);
  };

  // Remove a specific cleanup function
  const removeCleanup = (cleanupFn) => {
    cleanupFunctionsRef.current = cleanupFunctionsRef.current.filter(fn => fn !== cleanupFn);
  };

  // Execute all cleanup functions immediately
  const executeCleanup = () => {
    cleanupFunctionsRef.current.forEach(cleanupFn => {
      try {
        cleanupFn();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });
    cleanupFunctionsRef.current = [];
  };

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      executeCleanup();
    };
  }, []);

  return {
    addCleanup,
    removeCleanup,
    executeCleanup
  };
};