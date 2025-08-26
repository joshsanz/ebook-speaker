import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import CardView from './CardView';
import ListView from './ListView';
import './BookList.css';

const BookList = () => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState('card');
    const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'ascending' });
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedBooks, setSelectedBooks] = useState([]);

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

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/books', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('File upload failed');
            }

            fetchBooks(); // Refresh the book list
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (filename) => {
        try {
            const response = await fetch(`/api/books/${encodeURIComponent(filename)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('File deletion failed');
            }

            fetchBooks(); // Refresh the book list
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteSelected = async () => {
        try {
            await Promise.all(selectedBooks.map(filename => handleDelete(filename)));
            setSelectedBooks([]);
            setSelectionMode(false);
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleSelection = (filename) => {
        setSelectedBooks(prevSelected => {
            if (prevSelected.includes(filename)) {
                return prevSelected.filter(item => item !== filename);
            } else {
                return [...prevSelected, filename];
            }
        });
    };

    const sortedBooks = useMemo(() => {
        let sortableBooks = [...books];
        if (sortConfig !== null) {
            sortableBooks.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableBooks;
    }, [books, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div className="book-list-container">
            <h2>Available EPUB Books</h2>
            <div className="controls">
                <label htmlFor="file-upload" className="file-upload-label">
                    Upload EPUB
                </label>
                <input id="file-upload" type="file" onChange={handleFileUpload} accept=".epub" />
                <button onClick={() => setView(view === 'card' ? 'list' : 'card')} className="view-toggle-button">
                    {view === 'card' ? '📋 List View' : '🗃️ Card View'}
                </button>
                <button onClick={() => {
                    setSelectedBooks([]);
                    setSelectionMode(!selectionMode);
                }}>{selectionMode ? 'Cancel' : 'Select'}</button>
                {selectionMode && <button onClick={handleDeleteSelected} className="delete-selected-button">🗑️ Delete Selected</button>}
                {view === 'card' && !selectionMode && (
                    <div className="sort-controls">
                        <select onChange={(e) => requestSort(e.target.value)} value={sortConfig.key}>
                            <option value="title">Title</option>
                            <option value="author">Author</option>
                            <option value="date_uploaded">Date Uploaded</option>
                        </select>
                        <button onClick={() => requestSort(sortConfig.key)}>
                            {sortConfig.direction === 'ascending' ? '↓' : '↑'}
                        </button>
                    </div>
                )}
            </div>
            {view === 'card' ? (
                <CardView books={sortedBooks} selectionMode={selectionMode} selectedBooks={selectedBooks} toggleSelection={toggleSelection} />
            ) : (
                <ListView books={sortedBooks} onSort={requestSort} sortConfig={sortConfig} selectionMode={selectionMode} selectedBooks={selectedBooks} toggleSelection={toggleSelection} />
            )}
        </div>
    );
};

export default BookList;
