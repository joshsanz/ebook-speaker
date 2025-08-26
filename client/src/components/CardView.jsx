import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const CardView = ({ books, selectionMode, selectedBooks, toggleSelection }) => {
    const navigate = useNavigate();

    const handleCardClick = (book) => {
        if (selectionMode) {
            toggleSelection(book.filename);
        } else {
            navigate(`/book/${encodeURIComponent(book.filename)}`);
        }
    };

    return (
        <div className="books-grid">
            {books.map(book => (
                <div 
                    key={book.filename} 
                    className={`book-card ${selectedBooks.includes(book.filename) ? 'selected' : ''} ${selectionMode ? 'selection-mode' : ''}`} 
                    onClick={() => handleCardClick(book)}
                >
                    {selectionMode && <input type="checkbox" checked={selectedBooks.includes(book.filename)} readOnly/>}
                    {selectionMode ? (
                        <div className="book-info">
                            <h3 className="book-title">{book.title}</h3>
                            <p className="book-author">by {book.author}</p>
                        </div>
                    ) : (
                        <Link to={`/book/${encodeURIComponent(book.filename)}`} onClick={(e) => e.stopPropagation()}>
                            <div className="book-info">
                                <h3 className="book-title">{book.title}</h3>
                                <p className="book-author">by {book.author}</p>
                            </div>
                        </Link>
                    )}
                </div>
            ))}
        </div>
    );
};

export default CardView;
