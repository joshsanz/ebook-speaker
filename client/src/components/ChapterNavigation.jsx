import React from 'react';

/**
 * Chapter navigation component
 */
const ChapterNavigation = ({
  goToPreviousChapter,
  goBackToTOC,
  goToNextChapter,
  getCurrentChapterIndex,
  chapters,
  className = ''
}) => {
  const currentIndex = getCurrentChapterIndex();
  const isFirstChapter = currentIndex === 0;
  const isLastChapter = currentIndex === chapters.length - 1;

  return (
    <div className={`chapter-navigation ${className}`}>
      <button
        onClick={goToPreviousChapter}
        disabled={isFirstChapter}
        className="nav-button prev-button"
      >
        ← Previous
      </button>
      <button onClick={goBackToTOC} className="nav-button toc-button">
        📚 Table of Contents
      </button>
      <button
        onClick={goToNextChapter}
        disabled={isLastChapter}
        className="nav-button next-button"
      >
        Next →
      </button>
    </div>
  );
};

export default ChapterNavigation;