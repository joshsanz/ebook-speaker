const { EPub } = require('epub2');
const fs = require('fs');
const path = require('path');

class EpubReader {
    constructor(epubPath) {
        this.epubPath = epubPath;
        this.epub = null;
        this.chapters = [];
    }

    /**
     * Initialize the EPUB reader and parse the file
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                this.epub = new EPub(this.epubPath);

                this.epub.on('end', () => {
                    console.log('EPUB file parsed successfully');
                    this.extractChapters();
                    resolve();
                });

                this.epub.on('error', (error) => {
                    console.error('Error parsing EPUB:', error);
                    reject(error);
                });

                this.epub.parse();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Extract chapter information from the EPUB
     */
    extractChapters() {
        this.chapters = [];

        // Get the table of contents
        const toc = this.epub.toc;

        if (toc && toc.length > 0) {
            toc.forEach((chapter, index) => {
                this.chapters.push({
                    id: chapter.id,
                    title: chapter.title,
                    href: chapter.href,
                    order: index + 1
                });
            });
        } else {
            // If no TOC, use spine order
            this.epub.spine.contents.forEach((item, index) => {
                const manifestItem = this.epub.manifest[item.id];
                if (manifestItem && manifestItem['media-type'] === 'application/xhtml+xml') {
                    this.chapters.push({
                        id: item.id,
                        title: `Chapter ${index + 1}`,
                        href: manifestItem.href,
                        order: index + 1
                    });
                }
            });
        }
    }

    /**
     * Get list of all chapters
     */
    getChapterList() {
        return this.chapters.map(chapter => ({
            order: chapter.order,
            title: chapter.title,
            id: chapter.id
        }));
    }

    /**
     * Get chapter content by ID
     */
    async getChapterContent(chapterId) {
        return new Promise((resolve, reject) => {
            this.epub.getChapter(chapterId, (error, text) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(text);
                }
            });
        });
    }

    /**
     * Display all chapters with their content
     */
    async displayAllChapters() {
        console.log('\n=== EPUB CHAPTERS ===\n');
        console.log(`Book Title: ${this.epub.metadata.title || 'Unknown'}`);
        console.log(`Author: ${this.epub.metadata.creator || 'Unknown'}`);
        console.log(`Total Chapters: ${this.chapters.length}\n`);

        for (const chapter of this.chapters) {
            try {
                console.log(`\n--- Chapter ${chapter.order}: ${chapter.title} ---\n`);

                const content = await this.getChapterContent(chapter.id);

                // Clean up HTML content for display
                const cleanContent = this.cleanHtmlContent(content);

                // Display first 500 characters of each chapter
                const preview = cleanContent.length > 500
                    ? cleanContent.substring(0, 500) + '...'
                    : cleanContent;

                console.log(preview);
                console.log('\n' + '='.repeat(80));

            } catch (error) {
                console.error(`Error reading chapter ${chapter.title}:`, error.message);
            }
        }
    }

    /**
     * Display chapter list only
     */
    displayChapterList() {
        console.log('\n=== CHAPTER LIST ===\n');
        console.log(`Book: ${this.epub.metadata.title || 'Unknown'}`);
        console.log(`Author: ${this.epub.metadata.creator || 'Unknown'}\n`);

        this.chapters.forEach(chapter => {
            console.log(`${chapter.order}. ${chapter.title}`);
        });
        console.log(`\nTotal: ${this.chapters.length} chapters\n`);
    }

    /**
     * Clean HTML content for text display
     */
    cleanHtmlContent(html) {
        if (!html) return '';

        // Remove HTML tags
        let text = html.replace(/<[^>]*>/g, '');

        // Decode HTML entities
        text = text.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, ' ');

        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    }

    /**
     * Get book metadata
     */
    getMetadata() {
        if (!this.epub) return null;

        return {
            title: this.epub.metadata.title,
            creator: this.epub.metadata.creator,
            publisher: this.epub.metadata.publisher,
            language: this.epub.metadata.language,
            date: this.epub.metadata.date,
            description: this.epub.metadata.description
        };
    }
}

module.exports = EpubReader;
