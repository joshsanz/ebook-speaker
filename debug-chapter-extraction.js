const EpubReader = require('./epub-reader');
const path = require('path');
const fs = require('fs');
const log = require('loglevel');

// Set debug logging to see all details
log.setLevel('DEBUG');

/**
 * Comprehensive chapter extraction debug script
 * Usage: node debug-chapter-extraction.js <book_name>
 * Example: node debug-chapter-extraction.js excession
 * Example: node debug-chapter-extraction.js "A Quantum Murder"
 */
class ChapterExtractionDebugger {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
    }

    /**
     * Find EPUB file matching the search term
     */
    findEpubFile(searchTerm) {
        const allFiles = this.getAllEpubFiles(this.dataDir);

        if (!searchTerm) {
            if (allFiles.length === 0) {
                throw new Error('No EPUB files found in data directory');
            }
            console.log('No search term provided. Available books:');
            allFiles.forEach((file, i) => {
                console.log(`  ${i + 1}. ${file.relativePath}`);
            });
            throw new Error('Please specify a book name to debug');
        }

        // Find matching file
        const matches = allFiles.filter(file =>
            file.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
            file.relativePath.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (matches.length === 0) {
            console.log('No matching books found. Available books:');
            allFiles.forEach((file, i) => {
                console.log(`  ${i + 1}. ${file.relativePath}`);
            });
            throw new Error(`No books found matching "${searchTerm}"`);
        }

        if (matches.length > 1) {
            console.log('Multiple matches found:');
            matches.forEach((file, i) => {
                console.log(`  ${i + 1}. ${file.relativePath}`);
            });
            console.log('Using first match. Be more specific if needed.');
        }

        return matches[0];
    }

    /**
     * Recursively find all EPUB files
     */
    getAllEpubFiles(dir, baseDir = '') {
        const epubFiles = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.join(baseDir, entry.name);

                if (entry.isDirectory()) {
                    const subFiles = this.getAllEpubFiles(fullPath, relativePath);
                    epubFiles.push(...subFiles);
                } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.epub')) {
                    epubFiles.push({
                        filename: entry.name,
                        relativePath: relativePath,
                        fullPath: fullPath,
                        directory: baseDir || '.'
                    });
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dir}: ${error.message}`);
        }

        return epubFiles;
    }

    /**
     * Main debug function
     */
    async debug(searchTerm) {
        console.log('='.repeat(80));
        console.log('CHAPTER EXTRACTION DEBUG ANALYSIS');
        console.log('='.repeat(80));

        try {
            // Find the book
            const bookFile = this.findEpubFile(searchTerm);
            console.log(`\nDebugging: ${bookFile.relativePath}`);
            console.log(`Full path: ${bookFile.fullPath}`);
            console.log('-'.repeat(60));

            // Initialize reader with debug logging
            const reader = new EpubReader(bookFile.fullPath, false, 'DEBUG');

            console.log('\n1. INITIALIZING EPUB...');
            await reader.initialize();

            console.log('\n2. ANALYZING INITIAL CHAPTER EXTRACTION...');
            const initialChapters = reader.getChapterList();
            console.log(`Total chapters extracted: ${initialChapters.length}`);

            // Show TOC analysis
            console.log('\n3. TOC STRUCTURE ANALYSIS...');
            if (reader.epub.toc && reader.epub.toc.length > 0) {
                console.log(`TOC has ${reader.epub.toc.length} entries:`);
                reader.epub.toc.forEach((tocEntry, i) => {
                    console.log(`  ${i + 1}. "${tocEntry.title}" (ID: ${tocEntry.id}, href: ${tocEntry.href})`);
                });

                // Show specific TOC entries we're looking for
                console.log('\n3b. SEARCHING FOR SPECIFIC TOC ENTRIES...');
                const specificTitles = ['CHAPTER NINETEEN', 'ABOUT THE AUTHOR', 'PREVIOUS WORKS'];
                specificTitles.forEach(title => {
                    const found = reader.epub.toc.filter(tocEntry =>
                        tocEntry.title && tocEntry.title.includes(title)
                    );
                    if (found.length > 0) {
                        console.log(`  Found ${found.length} entries containing "${title}":`);
                        found.forEach(entry => {
                            console.log(`    "${entry.title}" (ID: ${entry.id}, href: ${entry.href})`);
                        });
                    } else {
                        console.log(`  No entries found containing "${title}"`);
                    }
                });
            } else {
                console.log('No TOC entries found');
            }

            // Show chapters before improvement
            console.log('\n4. CHAPTERS BEFORE TITLE IMPROVEMENT...');
            const beforeChapters = reader.getChapterList();
            beforeChapters.forEach((chapter, i) => {
                if (i < 15) {  // Show first 15 chapters
                    console.log(`  ${chapter.order}: "${chapter.title}" (ID: ${chapter.id})`);
                } else if (i === 15) {
                    console.log(`  ... and ${beforeChapters.length - 15} more chapters`);
                }
            });

            console.log('\n5. RUNNING TITLE IMPROVEMENT...');
            await reader.improveChapterTitles();

            console.log('\n6. CHAPTERS AFTER TITLE IMPROVEMENT...');
            const afterChapters = reader.getChapterList();
            afterChapters.forEach((chapter, i) => {
                if (i < 15) {  // Show first 15 chapters
                    const beforeTitle = beforeChapters[i]?.title || 'N/A';
                    const status = beforeTitle !== chapter.title ? '✓ CHANGED' : '- same';
                    console.log(`  ${chapter.order}: "${chapter.title}" (ID: ${chapter.id}) ${status}`);
                } else if (i === 15) {
                    console.log(`  ... and ${afterChapters.length - 15} more chapters`);
                }
            });

            console.log('\n7. TITLE IMPROVEMENT ANALYSIS...');
            let tocMatches = 0;
            let contentExtractions = 0;
            let stillDefault = 0;

            afterChapters.forEach(chapter => {
                if (chapter.title.match(/^Chapter \\d+$/)) {
                    stillDefault++;
                } else {
                    // Check if this looks like a TOC match (proper title) or content extraction (short/truncated)
                    if (chapter.title.length > 20 || !chapter.title.endsWith('...')) {
                        tocMatches++;
                    } else {
                        contentExtractions++;
                    }
                }
            });

            console.log(`Analysis of ${afterChapters.length} chapters:`);
            console.log(`  - TOC matches (estimated): ${tocMatches}`);
            console.log(`  - Content extractions (estimated): ${contentExtractions}`);
            console.log(`  - Still default titles: ${stillDefault}`);
            console.log(`  - Improvement rate: ${((afterChapters.length - stillDefault) / afterChapters.length * 100).toFixed(1)}%`);

            // Check for specific problems
            console.log('\n8. CONTENT EXTRACTION ANALYSIS...');
            await this.analyzeContentExtraction(reader, beforeChapters, afterChapters);

            console.log('\n9. SAMPLE CHAPTER CONTENT ANALYSIS...');
            await this.analyzeSampleChapters(reader, afterChapters);

            console.log('\n10. METADATA...');
            const metadata = reader.getMetadata();
            console.log(`  Title: ${metadata.title}`);
            console.log(`  Author: ${metadata.creator}`);
            console.log(`  Language: ${metadata.language}`);

        } catch (error) {
            console.error(`Error in debug analysis: ${error.message}`);
            console.error(error.stack);
        }

        console.log('\n' + '='.repeat(80));
        console.log('DEBUG ANALYSIS COMPLETE');
        console.log('='.repeat(80));
    }

    /**
     * Analyze content extraction effectiveness
     */
    async analyzeContentExtraction(reader, beforeChapters, afterChapters) {
        console.log('Analyzing content extraction effectiveness...');

        // Look for chapters that should have gotten content-based titles but didn't
        console.log('\nChecking chapters that may have missed content extraction...');
        let missedContentExtractions = 0;

        for (let i = 0; i < Math.min(15, afterChapters.length); i++) {
            const chapter = afterChapters[i];
            if (chapter.title.match(/^Chapter \\d+$/)) {
                try {
                    const content = await reader.getChapterContent(chapter.id);
                    const cleanContent = reader.cleanHtmlContent(content);
                    const extractedTitle = reader.extractTitleFromHtmlContent(content);

                    if (cleanContent && cleanContent.trim().length > 100) {
                        const firstLine = cleanContent.split('\\n')[0].trim();
                        console.log(`  Chapter ${chapter.order} ("${chapter.title}") has content but no title extracted:`);
                        console.log(`    Content preview: "${firstLine.substring(0, 80)}..."`);
                        if (extractedTitle) {
                            console.log(`    Extracted title: "${extractedTitle}"`);
                        } else {
                            console.log(`    No title could be extracted from content`);
                            missedContentExtractions++;
                        }
                    }
                } catch (error) {
                    console.log(`  Chapter ${chapter.order}: Error reading content - ${error.message}`);
                }
            }
        }

        if (missedContentExtractions > 0) {
            console.log(`\n⚠️  Found ${missedContentExtractions} chapters with content that couldn't get titles extracted`);
        }

        // Show TOC for reference (no longer used for matching)
        if (reader.epub.toc && reader.epub.toc.length > 0) {
            console.log(`\nReference: Book has ${reader.epub.toc.length} TOC entries (no longer used for title matching)`);
        }
    }

    /**
     * Analyze a few sample chapters in detail
     */
    async analyzeSampleChapters(reader, chapters) {
        const samplesToAnalyze = Math.min(3, chapters.length);
        console.log(`Analyzing ${samplesToAnalyze} sample chapters in detail...`);

        for (let i = 0; i < samplesToAnalyze; i++) {
            const chapter = chapters[i + 1]; // Skip first chapter (usually title page)
            if (!chapter) continue;

            console.log(`\\n--- Chapter ${chapter.order}: "${chapter.title}" (ID: ${chapter.id}) ---`);
            try {
                const content = await reader.getChapterContent(chapter.id);
                const cleanContent = reader.cleanHtmlContent(content);

                console.log(`Raw content length: ${content ? content.length : 0} characters`);
                console.log(`Clean content length: ${cleanContent ? cleanContent.length : 0} characters`);

                if (content) {
                    console.log(`Raw content preview (first 150 chars):`);
                    console.log(`  "${content.substring(0, 150).replace(/\\s+/g, ' ')}..."`);
                }

                if (cleanContent) {
                    console.log(`Clean content preview (first 150 chars):`);
                    console.log(`  "${cleanContent.substring(0, 150)}..."`);
                }

                // Test title extraction
                const extractedTitle = reader.extractTitleFromHtmlContent(content);
                console.log(`Title extraction test result: "${extractedTitle}"`);

            } catch (error) {
                console.log(`Error analyzing chapter: ${error.message}`);
            }
        }
    }
}

// Main execution
async function main() {
    const searchTerm = process.argv[2];
    const debugTool = new ChapterExtractionDebugger();
    await debugTool.debug(searchTerm);
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Debug script failed:', error.message);
        process.exit(1);
    });
}

module.exports = ChapterExtractionDebugger;
