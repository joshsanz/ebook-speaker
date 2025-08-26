import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const ListView = ({ books, onSort, sortConfig, selectionMode, selectedBooks, toggleSelection }) => {
    const navigate = useNavigate();
    const getSortArrow = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'ascending' ? ' ↓' : ' ↑';
        }
        return '';
    };

    const handleRowClick = (book, event) => {
        // Prevent navigation if clicking on checkbox
        if (event.target.type === 'checkbox') {
            return;
        }
        
        if (selectionMode) {
            toggleSelection(book.filename);
        } else {
            navigate(`/book/${encodeURIComponent(book.filename)}`);
        }
    };

    return (
        <table className="book-list-table">
            <thead>
                <tr>
                    {selectionMode && <th></th>}
                    <th onClick={() => onSort('title')}>Title{getSortArrow('title')}</th>
                    <th onClick={() => onSort('author')}>Author{getSortArrow('author')}</th>
                    <th onClick={() => onSort('date_uploaded')}>Date Uploaded{getSortArrow('date_uploaded')}</th>
                </tr>
            </thead>
            <tbody>
                {books.map(book => (
                    <tr 
                        key={book.filename} 
                        className={`${selectedBooks.includes(book.filename) ? 'selected' : ''} ${selectionMode ? 'selection-mode' : 'clickable-row'}`}
                        onClick={(e) => handleRowClick(book, e)}
                    >
                        {selectionMode && (
                            <td>
                                <input type="checkbox" checked={selectedBooks.includes(book.filename)} onChange={() => toggleSelection(book.filename)} />
                            </td>
                        )}
                        <td>
                            {selectionMode ? book.title : (
                                <Link to={`/book/${encodeURIComponent(book.filename)}`} onClick={(e) => e.stopPropagation()}>
                                    {book.title}
                                </Link>
                            )}
                        </td>
                        <td>{book.author}</td>
                        <td>{new Date(book.date_uploaded).toLocaleDateString()}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default ListView;
