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
        const toc = this.epub.toc;
        const spine = this.epub.spine.contents;
        const manifest = this.epub.manifest;

        console.log(`EPUB Analysis: TOC entries: ${toc?.length || 0}, Spine items: ${spine.length}`);

        if (toc && toc.length > 0) {
            // Use TOC but validate that chapters exist in spine
            let spineIndex = 0; // Track spine position for better fallback

            toc.forEach((chapter, tocIndex) => {
                let spineId = null;
                let foundSpineItem = null;

                // First, try direct ID match
                foundSpineItem = spine.find(item => item.id === chapter.id);

                // If not found, try to find by href
                if (!foundSpineItem && chapter.href) {
                    foundSpineItem = spine.find(item => {
                        const manifestItem = manifest[item.id];
                        if (!manifestItem) return false;
                        return manifestItem.href === chapter.href ||
                               manifestItem.href === chapter.href.replace(/^.*\//, '') || // Try without path
                               manifestItem.href.endsWith('/' + chapter.href.replace(/^.*\//, '')); // Try with path
                    });
                }

                // If still not found, try to find by partial href match (filename only)
                if (!foundSpineItem && chapter.href) {
                    const chapterFile = chapter.href.split('/').pop().split('#')[0];
                    foundSpineItem = spine.find(item => {
                        const manifestItem = manifest[item.id];
                        if (!manifestItem) return false;
                        const manifestFile = manifestItem.href.split('/').pop().split('#')[0];
                        return manifestFile === chapterFile;
                    });
                }

                // Additional fallback: try to match by title patterns in manifest
                if (!foundSpineItem && chapter.title) {
                    const titlePatterns = [
                        chapter.title.toLowerCase(),
                        chapter.title.toLowerCase().replace(/[^\w\s]/g, ''), // Remove punctuation
                        chapter.title.toLowerCase().replace(/\s+/g, ''), // Remove spaces
                        `chapter ${tocIndex + 1}`.toLowerCase(),
                        `ch ${tocIndex + 1}`.toLowerCase()
                    ];

                    foundSpineItem = spine.find(item => {
                        const manifestItem = manifest[item.id];
                        if (!manifestItem) return false;
                        const manifestTitle = (manifestItem.title || '').toLowerCase();
                        return titlePatterns.some(pattern => manifestTitle.includes(pattern));
                    });
                }

                if (foundSpineItem) {
                    spineId = foundSpineItem.id;
                    // Update spine index to this found item for better subsequent fallbacks
                    spineIndex = spine.findIndex(item => item.id === spineId) + 1;
                } else {
                    // Improved fallback logic: find the next valid spine item
                    let nextValidSpineItem = null;

                    // Try to find the next spine item that contains chapter-like content
                    for (let i = spineIndex; i < spine.length; i++) {
                        const spineItem = spine[i];
                        const manifestItem = manifest[spineItem.id];

                        if (manifestItem && manifestItem['media-type'] === 'application/xhtml+xml') {
                            // Additional check: try to get content and see if it's substantial
                            try {
                                // We'll validate this spine item by checking if it has meaningful content
                                nextValidSpineItem = spineItem;
                                spineIndex = i + 1;
                                break;
                            } catch (error) {
                                console.warn(`Error validating spine item ${spineItem.id}:`, error.message);
                                continue;
                            }
                        }
                    }

                    if (nextValidSpineItem) {
                        spineId = nextValidSpineItem.id;
                        console.warn(`Using next valid spine item ${spineId} for TOC entry: ${chapter.title}`);
                    } else {
                        console.warn(`No valid spine item found for chapter: ${chapter.title} (${chapter.href})`);
                        // Skip this chapter entirely rather than using a potentially wrong one
                        return;
                    }
                }

                // Ensure spineId is valid before adding
                if (spineId && manifest[spineId]) {
                    this.chapters.push({
                        id: spineId,
                        title: chapter.title,
                        href: chapter.href,
                        order: tocIndex + 1
                    });
                } else {
                    console.warn(`Invalid spineId ${spineId} for chapter: ${chapter.title}`);
                }
            });
        } else {
            // If no TOC, use spine order with better content validation
            spine.forEach((item, index) => {
                const manifestItem = manifest[item.id];
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

        // Final validation: ensure all chapters have unique IDs and proper ordering
        this.validateAndCleanChapters();
    }

    /**
     * Validate and clean chapter list to ensure consistency
     */
    validateAndCleanChapters() {
        const originalCount = this.chapters.length;
        console.log(`Validating ${originalCount} chapters...`);

        // Remove duplicates based on spine ID
        const seenIds = new Set();
        this.chapters = this.chapters.filter(chapter => {
            if (seenIds.has(chapter.id)) {
                console.warn(`Removing duplicate chapter ID: ${chapter.id} (${chapter.title})`);
                return false;
            }
            seenIds.add(chapter.id);
            return true;
        });

        // Ensure proper ordering and fix any gaps
        this.chapters.sort((a, b) => a.order - b.order);

        // Reassign order numbers to be consecutive
        this.chapters.forEach((chapter, index) => {
            chapter.order = index + 1;
        });

        const finalCount = this.chapters.length;
        if (finalCount !== originalCount) {
            console.log(`Chapter validation complete: ${originalCount} → ${finalCount} chapters`);
        }

        console.log(`Final chapter list: ${this.chapters.map(c => `${c.order}: ${c.title} (ID: ${c.id})`).join(', ')}`);
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
     * Clean HTML content for text display while preserving paragraph structure
     */
    cleanHtmlContent(html) {
        if (!html) return '';

        // Convert paragraph and div tags to double line breaks before removing HTML
        let text = html.replace(/<\/p>/gi, '\n\n')
                      .replace(/<\/div>/gi, '\n\n')
                      .replace(/<br\s*\/?>/gi, '\n')
                      .replace(/<\/h[1-6]>/gi, '\n\n');

        // Remove HTML tags
        text = text.replace(/<[^>]*>/g, '');

        // Decode HTML entities
        text = text.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&#8217;/g, "'")
                  .replace(/&#8220;/g, '"')
                  .replace(/&#8221;/g, '"')
                  .replace(/&#8211;/g, '–')
                  .replace(/&#8212;/g, '—');

        // Clean up excessive whitespace while preserving paragraph breaks
        text = text.replace(/[ \t]+/g, ' ')  // Replace multiple spaces/tabs with single space
                  .replace(/\n[ \t]+/g, '\n')  // Remove spaces at start of lines
                  .replace(/[ \t]+\n/g, '\n')  // Remove spaces at end of lines
                  .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
                  .trim();

        return text;
    }
    /**
     * Get raw HTML content for web display (preserves formatting)
     */
    getRawHtmlContent(html) {
        if (!html) return '';

        // Clean up the HTML but preserve structure for web display
        let cleanHtml = html.replace(/&nbsp;/g, ' ')
                           .replace(/&#8217;/g, "'")
                           .replace(/&#8220;/g, '"')
                           .replace(/&#8221;/g, '"')
                           .replace(/&#8211;/g, '–')
                           .replace(/&#8212;/g, '—');

        return cleanHtml;
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

    /**
     * Debug method to analyze EPUB structure and identify potential issues
     */
    debugEpubStructure() {
        if (!this.epub) {
            console.log('EPUB not initialized');
            return;
        }

        console.log('\n=== EPUB STRUCTURE DEBUG ===\n');

        console.log('Metadata:');
        console.log(`  Title: ${this.epub.metadata.title || 'N/A'}`);
        console.log(`  Creator: ${this.epub.metadata.creator || 'N/A'}`);
        console.log(`  Language: ${this.epub.metadata.language || 'N/A'}`);

        console.log('\nTOC Analysis:');
        if (this.epub.toc && this.epub.toc.length > 0) {
            console.log(`  TOC entries: ${this.epub.toc.length}`);
            this.epub.toc.forEach((item, index) => {
                console.log(`    ${index + 1}. ${item.title} (ID: ${item.id}, href: ${item.href})`);
            });
        } else {
            console.log('  No TOC found');
        }

        console.log('\nSpine Analysis:');
        console.log(`  Spine items: ${this.epub.spine.contents.length}`);
        this.epub.spine.contents.forEach((item, index) => {
            const manifestItem = this.epub.manifest[item.id];
            const mediaType = manifestItem ? manifestItem['media-type'] : 'unknown';
            console.log(`    ${index + 1}. ID: ${item.id}, Media-Type: ${mediaType}, href: ${manifestItem?.href || 'N/A'}`);
        });

        console.log('\nManifest Analysis:');
        const manifestEntries = Object.keys(this.epub.manifest);
        console.log(`  Manifest entries: ${manifestEntries.length}`);
        manifestEntries.forEach(id => {
            const item = this.epub.manifest[id];
            console.log(`    ${id}: ${item.href} (${item['media-type']})`);
        });

        console.log('\nChapter Mapping Analysis:');
        console.log(`  Final chapters: ${this.chapters.length}`);
        this.chapters.forEach((chapter, index) => {
            console.log(`    ${index + 1}. ${chapter.title} (ID: ${chapter.id}, Order: ${chapter.order})`);
        });

        console.log('\n=== END DEBUG ===\n');
    }
}

module.exports = EpubReader;
