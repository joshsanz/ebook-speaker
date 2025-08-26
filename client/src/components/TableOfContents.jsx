import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Table of Contents component
 */
const TableOfContents = ({ chapters, filename }) => {
  const navigate = useNavigate();

  if (chapters.length === 0) {
    return (
      <div className="table-of-contents">
        <h2>Table of Contents</h2>
        <p>No chapters found in this book.</p>
      </div>
    );
  }

  return (
    <div className="table-of-contents">
      <h2>Table of Contents</h2>
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
    </div>
  );
};

export default TableOfContents;