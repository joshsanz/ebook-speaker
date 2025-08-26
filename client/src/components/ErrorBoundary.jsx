import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Error display component for user-friendly error messages
 */
const ErrorDisplay = ({ error, onRetry, showBackLink = false }) => {
  return (
    <div className="book-reader-container">
      <div className="error">
        <h3>Something went wrong</h3>
        <p>Error: {error}</p>
        {onRetry && (
          <button onClick={onRetry} className="retry-button">
            Try Again
          </button>
        )}
        {showBackLink && (
          <Link to="/" className="back-link">
            ← Back to Book List
          </Link>
        )}
      </div>
    </div>
  );
};

/**
 * Loading display component
 */
const LoadingDisplay = ({ message = 'Loading...' }) => {
  return (
    <div className="book-reader-container">
      <div className="loading">{message}</div>
    </div>
  );
};

export { ErrorDisplay, LoadingDisplay };