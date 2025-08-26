import { useState, useEffect } from 'react';

/**
 * Custom hook for managing localStorage with automatic syncing
 * @param {string} key - The localStorage key
 * @param {*} defaultValue - Default value if nothing in localStorage
 * @param {Function} parser - Optional parser function for complex types
 * @returns {[value, setValue]} - Current value and setter function
 */
export const useLocalStorage = (key, defaultValue, parser = (v) => v) => {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? parser(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : value.toString();
      localStorage.setItem(key, stringValue);
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue];
};