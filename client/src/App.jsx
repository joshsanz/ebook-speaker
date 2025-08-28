import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import BookList from './components/BookList.jsx';
import BookReader from './components/BookReader.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="App">
          <header className="App-header">
            <Link to="/" className="header-title-link">
              <h1>EPUB Reader</h1>
            </Link>
            <ThemeToggle />
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
    </ThemeProvider>
  );
}

export default App;
