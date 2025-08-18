import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BookList from './components/BookList';
import BookReader from './components/BookReader';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>EPUB Reader</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<BookList />} />
            <Route path="/book/:filename" element={<BookReader />} />
            <Route path="/book/:filename/chapter/:chapterId" element={<BookReader />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
