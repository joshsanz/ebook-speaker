import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './BookList.css';

const BookList = () => {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await fetch('/api/books');
      if (!response.ok) {
        throw new Error('Failed to fetch books');
      }
      const data = await response.json();
      setBooks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="book-list-container">
        <div className="loading">Loading books...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="book-list-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="book-list-container">
      <h2>Available EPUB Books</h2>
      {books.length === 0 ? (
        <div className="no-books">
          <p>No EPUB files found in the data directory.</p>
          <p>Please add some .epub files to the data/ folder.</p>
        </div>
      ) : (
        <div className="books-grid">
          {books.map((book) => (
            <Link
              key={book.filename}
              to={`/book/${encodeURIComponent(book.filename)}`}
              className="book-card"
            >
              <div className="book-info">
                <h3 className="book-title">{book.displayName}</h3>
                <p className="book-filename">{book.filename}</p>
              </div>
              <div className="book-arrow">→</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookList;
