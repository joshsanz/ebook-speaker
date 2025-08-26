const EpubReader = require('./epub-reader');
const path = require('path');
const fs = require('fs');

/**
 * Comprehensive test suite for EPUB parsing functionality
 * Tests both chapter loading and whitespace preservation
 */
class EpubFunctionalityTester {
    constructor() {
        this.testResults = [];
        this.dataDir = path.join(__dirname, 'data');
    }

    /**
     * Log test results
     */
    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logMessage);
        this.testResults.push({ timestamp, type, message });
    }

    /**
     * Test if all chapters can be loaded successfully
     */
    async testChapterLoading(reader, bookTitle) {
        this.log(`Testing chapter loading for: ${bookTitle}`);

        const chapters = reader.getChapterList();
        this.log(`Found ${chapters.length} chapters`);

        if (chapters.length === 0) {
            this.log('No chapters found - this might indicate a parsing issue', 'warning');
            return false;
        }

        let successfulChapters = 0;
        let failedChapters = 0;
        const chapterDetails = [];

        for (const chapter of chapters) {
            try {
                const content = await reader.getChapterContent(chapter.id);

                if (content && content.trim().length > 0) {
                    successfulChapters++;
                    chapterDetails.push({
                        id: chapter.id,
                        title: chapter.title,
                        contentLength: content.length,
                        status: 'success'
                    });
                    this.log(`✓ Chapter ${chapter.order}: "${chapter.title}" loaded (${content.length} chars)`);
                } else {
                    failedChapters++;
                    chapterDetails.push({
                        id: chapter.id,
                        title: chapter.title,
                        contentLength: 0,
                        status: 'empty'
                    });
                    this.log(`✗ Chapter ${chapter.order}: "${chapter.title}" is empty`, 'error');
                }
            } catch (error) {
                failedChapters++;
                chapterDetails.push({
                    id: chapter.id,
                    title: chapter.title,
                    error: error.message,
                    status: 'failed'
                });
                this.log(`✗ Chapter ${chapter.order}: "${chapter.title}" failed to load - ${error.message}`, 'error');
            }
        }

        const allChaptersLoaded = failedChapters === 0;
        this.log(`Chapter loading summary: ${successfulChapters}/${chapters.length} successful`);

        return {
            success: allChaptersLoaded,
            totalChapters: chapters.length,
            successfulChapters,
            failedChapters,
            details: chapterDetails
        };
    }

    /**
     * Test whitespace preservation in content
     */
    async testWhitespacePreservation(reader, bookTitle) {
        this.log(`Testing whitespace preservation for: ${bookTitle}`);

        const chapters = reader.getChapterList();
        if (chapters.length === 0) {
            this.log('No chapters to test whitespace preservation', 'warning');
            return false;
        }

        // Test first few chapters for whitespace preservation
        const chaptersToTest = Math.min(3, chapters.length);
        let whitespaceTests = [];

        for (let i = 0; i < chaptersToTest; i++) {
            const chapter = chapters[i];
            try {
                const rawContent = await reader.getChapterContent(chapter.id);
                const cleanTextContent = reader.cleanHtmlContent(rawContent);
                const htmlContent = reader.getRawHtmlContent(rawContent);

                // Test for paragraph breaks (should have double newlines)
                const hasParagraphBreaks = cleanTextContent.includes('\n\n');

                // Test that content isn't just one long line
                const lines = cleanTextContent.split('\n').filter(line => line.trim().length > 0);
                const hasMultipleLines = lines.length > 1;

                // Test that HTML content preserves some structure
                const hasHtmlStructure = htmlContent.includes('<p>') || htmlContent.includes('<div>') || htmlContent.includes('<br');

                const whitespaceTest = {
                    chapterTitle: chapter.title,
                    hasParagraphBreaks,
                    hasMultipleLines,
                    hasHtmlStructure,
                    lineCount: lines.length,
                    textLength: cleanTextContent.length,
                    htmlLength: htmlContent.length,
                    rawLength: rawContent.length
                };

                whitespaceTests.push(whitespaceTest);

                this.log(`Chapter "${chapter.title}": Paragraph breaks: ${hasParagraphBreaks}, Lines: ${lines.length}, HTML structure: ${hasHtmlStructure}`);

                // Show a sample of the cleaned content to verify formatting
                if (cleanTextContent.length > 200) {
                    const sample = cleanTextContent.substring(0, 200) + '...';
                    this.log(`Sample text: "${sample}"`);
                }

            } catch (error) {
                this.log(`Error testing whitespace for chapter "${chapter.title}": ${error.message}`, 'error');
                whitespaceTests.push({
                    chapterTitle: chapter.title,
                    error: error.message
                });
            }
        }

        // Evaluate overall whitespace preservation
        const successfulTests = whitespaceTests.filter(test =>
            !test.error && test.hasParagraphBreaks && test.hasMultipleLines
        );

        const whitespacePreserved = successfulTests.length > 0;
        this.log(`Whitespace preservation: ${successfulTests.length}/${whitespaceTests.length} chapters passed`);

        return {
            success: whitespacePreserved,
            testsRun: whitespaceTests.length,
            testsPassed: successfulTests.length,
            details: whitespaceTests
        };
    }

    /**
     * Test a single EPUB file
     */
    async testEpubFile(filename) {
        this.log(`\n${'='.repeat(60)}`);
        this.log(`Testing EPUB file: ${filename}`);
        this.log(`${'='.repeat(60)}`);

        try {
            const epubPath = path.join(this.dataDir, filename);

            // Check if file exists
            if (!fs.existsSync(epubPath)) {
                this.log(`File not found: ${epubPath}`, 'error');
                return { success: false, error: 'File not found' };
            }

            // Initialize reader
            const reader = new EpubReader(epubPath);
            await reader.initialize();

            // Get metadata
            const metadata = reader.getMetadata();
            this.log(`Book: ${metadata.title || 'Unknown'}`);
            this.log(`Author: ${metadata.creator || 'Unknown'}`);

            // Test chapter loading
            const chapterTest = await this.testChapterLoading(reader, metadata.title || filename);

            // Test whitespace preservation
            const whitespaceTest = await this.testWhitespacePreservation(reader, metadata.title || filename);

            const overallSuccess = chapterTest.success && whitespaceTest.success;

            this.log(`\nOverall test result for ${filename}: ${overallSuccess ? 'PASS' : 'FAIL'}`);

            return {
                success: overallSuccess,
                filename,
                metadata,
                chapterTest,
                whitespaceTest
            };

        } catch (error) {
            this.log(`Failed to test ${filename}: ${error.message}`, 'error');
            return {
                success: false,
                filename,
                error: error.message
            };
        }
    }

    /**
     * Test a single EPUB file with full path information
     */
    async testEpubFileWithPath(fileInfo) {
        this.log(`\n${'='.repeat(60)}`);
        this.log(`Testing EPUB file: ${fileInfo.relativePath}`);
        this.log(`Directory: ${fileInfo.directory}`);
        this.log(`${'='.repeat(60)}`);

        try {
            // Check if file exists
            if (!fs.existsSync(fileInfo.fullPath)) {
                this.log(`File not found: ${fileInfo.fullPath}`, 'error');
                return { success: false, error: 'File not found', filename: fileInfo.relativePath };
            }

            // Initialize reader
            const reader = new EpubReader(fileInfo.fullPath);
            await reader.initialize();

            // Improve chapter titles from content
            await reader.improveChapterTitles();

            // Get metadata
            const metadata = reader.getMetadata();
            this.log(`Book: ${metadata.title || 'Unknown'}`);
            this.log(`Author: ${metadata.creator || 'Unknown'}`);

            // Test new parsing improvements
            const parsingTest = await this.testParsingImprovements(reader, metadata.title || fileInfo.filename);

            // Test chapter navigation and mapping
            const navigationTest = await this.testChapterNavigation(reader, metadata.title || fileInfo.filename);

            // Test hyperlink processing
            const hyperlinkTest = await this.testHyperlinkProcessing(reader, metadata.title || fileInfo.filename, fileInfo.relativePath);

            // Test chapter loading
            const chapterTest = await this.testChapterLoading(reader, metadata.title || fileInfo.filename);

            // Test whitespace preservation
            const whitespaceTest = await this.testWhitespacePreservation(reader, metadata.title || fileInfo.filename);

            const overallSuccess = chapterTest.success && whitespaceTest.success && navigationTest.success;

            this.log(`\nOverall test result for ${fileInfo.relativePath}: ${overallSuccess ? 'PASS' : 'FAIL'}`);

            return {
                success: overallSuccess,
                filename: fileInfo.relativePath,
                directory: fileInfo.directory,
                metadata,
                parsingTest,
                navigationTest,
                hyperlinkTest,
                chapterTest,
                whitespaceTest
            };

        } catch (error) {
            this.log(`Failed to test ${fileInfo.relativePath}: ${error.message}`, 'error');
            return {
                success: false,
                filename: fileInfo.relativePath,
                directory: fileInfo.directory,
                error: error.message
            };
        }
    }

    /**
     * Recursively find all EPUB files in directory and subdirectories
     */
    findAllEpubFiles(dir, baseDir = '') {
        const epubFiles = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.join(baseDir, entry.name);

                if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    const subFiles = this.findAllEpubFiles(fullPath, relativePath);
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
            this.log(`Error reading directory ${dir}: ${error.message}`, 'error');
        }

        return epubFiles;
    }

    /**
     * Test chapter navigation and mapping
     */
    async testChapterNavigation(reader, bookTitle) {
        this.log(`Testing chapter navigation for: ${bookTitle}`);

        const chapters = reader.getChapterList();
        if (chapters.length === 0) {
            this.log('No chapters found for navigation testing', 'warning');
            return { success: false, details: 'No chapters' };
        }

        const results = {
            duplicateIds: 0,
            orderConsistent: true,
            navigationTests: []
        };

        // Test a few chapter transitions
        const testIndices = [0, 1, 2, Math.floor(chapters.length / 2), chapters.length - 2, chapters.length - 1];

        for (const testIndex of testIndices) {
            if (testIndex >= 0 && testIndex < chapters.length) {
                const chapter = chapters[testIndex];

                try {
                    // Test getting chapter content
                    const content = await reader.getChapterContent(chapter.id);
                    const cleanContent = reader.cleanHtmlContent(content);

                    const navTest = {
                        chapterIndex: testIndex,
                        chapterTitle: chapter.title,
                        chapterId: chapter.id,
                        contentLength: cleanContent.length,
                        hasPrevious: testIndex > 0,
                        hasNext: testIndex < chapters.length - 1,
                        status: 'success'
                    };

                    if (navTest.hasPrevious) {
                        const prevChapter = chapters[testIndex - 1];
                        navTest.previousChapter = { title: prevChapter.title, id: prevChapter.id };
                    }
                    if (navTest.hasNext) {
                        const nextChapter = chapters[testIndex + 1];
                        navTest.nextChapter = { title: nextChapter.title, id: nextChapter.id };
                    }

                    results.navigationTests.push(navTest);
                    this.log(`✓ Navigation test ${testIndex}: "${chapter.title}" (${cleanContent.length} chars)`);

                } catch (error) {
                    results.navigationTests.push({
                        chapterIndex: testIndex,
                        chapterTitle: chapter.title,
                        chapterId: chapter.id,
                        status: 'failed',
                        error: error.message
                    });
                    this.log(`✗ Navigation test ${testIndex}: "${chapter.title}" failed - ${error.message}`, 'error');
                }
            }
        }

        // Check for duplicate IDs
        const ids = chapters.map(ch => ch.id);
        const uniqueIds = new Set(ids);
        results.duplicateIds = ids.length - uniqueIds.size;

        if (results.duplicateIds > 0) {
            this.log(`✗ Found ${results.duplicateIds} duplicate chapter IDs`, 'error');
        } else {
            this.log('✓ All chapter IDs are unique');
        }

        // Check ordering consistency
        for (let i = 0; i < chapters.length; i++) {
            if (chapters[i].order !== i + 1) {
                results.orderConsistent = false;
                this.log(`✗ Chapter ${i} has order ${chapters[i].order}, expected ${i + 1}`, 'error');
                break;
            }
        }

        if (results.orderConsistent) {
            this.log('✓ Chapter ordering is consistent');
        }

        // Test edge cases
        if (chapters.length > 0) {
            const firstChapter = chapters[0];
            const lastChapter = chapters[chapters.length - 1];

            results.edgeTests = {
                firstChapterPrevDisabled: chapters.indexOf(firstChapter) === 0,
                firstChapterNextEnabled: chapters.indexOf(firstChapter) < chapters.length - 1,
                lastChapterPrevEnabled: chapters.indexOf(lastChapter) > 0,
                lastChapterNextDisabled: chapters.indexOf(lastChapter) === chapters.length - 1
            };

            this.log(`First chapter navigation: prev=${!results.edgeTests.firstChapterPrevDisabled}, next=${results.edgeTests.firstChapterNextEnabled}`);
            this.log(`Last chapter navigation: prev=${results.edgeTests.lastChapterPrevEnabled}, next=${!results.edgeTests.lastChapterNextDisabled}`);
        }

        const success = results.duplicateIds === 0 && results.orderConsistent &&
                        results.navigationTests.every(test => test.status === 'success');

        this.log(`Chapter navigation test ${success ? 'PASSED' : 'FAILED'}`);

        return {
            success,
            details: results
        };
    }

    /**
     * Test EPUB parsing and chapter title resolution (content-only approach)
     */
    async testParsingImprovements(reader, bookTitle) {
        this.log(`Testing parsing and title resolution for: ${bookTitle}`);

        const results = {
            flowUsed: false,
            contentCompleteness: 0,
            titleResolutionStats: {
                totalChapters: 0,
                defaultTitles: 0,
                contentExtractedTitles: 0,
                spineTitles: 0,
                manifestTitles: 0
            }
        };

        try {
            // Analyze chapters and their title sources
            const chapters = reader.getChapterList();
            const chapterDetails = reader.chapters || [];

            results.titleResolutionStats.totalChapters = chapters.length;

            // Check if flow-based parsing was used (should always be true now)
            if (chapterDetails.length > 0 && chapterDetails[0].source === 'flow') {
                results.flowUsed = true;
                this.log('✓ Flow-based parsing was used');
            } else {
                this.log('⚠ Flow-based parsing not detected - possible parsing issue', 'warning');
            }

            // Analyze chapter titles to see resolution effectiveness (content-only approach)
            chapterDetails.forEach(chapter => {
                if (chapter.title && chapter.title.match(/^Chapter \d+$/)) {
                    results.titleResolutionStats.defaultTitles++;
                } else if (chapter.titleSource === 'content') {
                    results.titleResolutionStats.contentExtractedTitles++;
                } else if (chapter.titleSource === 'spine') {
                    results.titleResolutionStats.spineTitles++;
                } else if (chapter.titleSource === 'manifest') {
                    results.titleResolutionStats.manifestTitles++;
                }
            });

            const meaningfulTitles = results.titleResolutionStats.totalChapters - results.titleResolutionStats.defaultTitles;
            const titleResolutionRate = results.titleResolutionStats.totalChapters > 0
                ? (meaningfulTitles / results.titleResolutionStats.totalChapters) * 100
                : 0;

            this.log(`Chapter title resolution: ${meaningfulTitles}/${results.titleResolutionStats.totalChapters} chapters have meaningful titles (${titleResolutionRate.toFixed(1)}%)`);

            if (results.titleResolutionStats.contentExtractedTitles > 0) {
                this.log(`✓ ${results.titleResolutionStats.contentExtractedTitles} titles extracted from chapter content`);
            }

            if (results.titleResolutionStats.spineTitles > 0) {
                this.log(`✓ ${results.titleResolutionStats.spineTitles} titles from spine metadata`);
            }

            if (results.titleResolutionStats.manifestTitles > 0) {
                this.log(`✓ ${results.titleResolutionStats.manifestTitles} titles from manifest`);
            }

            if (results.titleResolutionStats.defaultTitles > 0) {
                this.log(`⚠ ${results.titleResolutionStats.defaultTitles} chapters still using default titles ("Chapter N")`);
            }

            // Calculate content completeness
            const chaptersList = reader.getChapterList();
            const totalChapters = chaptersList.length;
            let chaptersWithContent = 0;

            // Test content loading for completeness
            for (const chapter of chaptersList) {
                try {
                    const content = await reader.getChapterContent(chapter.id);
                    const cleanContent = reader.cleanHtmlContent(content);
                    if (cleanContent && cleanContent.trim().length > 0) {
                        chaptersWithContent++;
                    }
                } catch (error) {
                    // Chapter failed to load
                }
            }

            results.contentCompleteness = totalChapters > 0 ? (chaptersWithContent / totalChapters) * 100 : 0;
            this.log(`Content completeness: ${chaptersWithContent}/${totalChapters} chapters (${results.contentCompleteness.toFixed(1)}%)`);

            if (results.contentCompleteness < 90) {
                this.log(`⚠ Low content completeness detected (${results.contentCompleteness.toFixed(1)}%)`, 'warning');
            } else {
                this.log('✓ Good content completeness');
            }

        } catch (error) {
            this.log(`Error testing parsing improvements: ${error.message}`, 'error');
        }

        return results;
    }

    /**
     * Test hyperlink processing functionality
     */
    async testHyperlinkProcessing(reader, bookTitle, filename) {
        this.log(`Testing hyperlink processing for: ${bookTitle}`);

        const results = {
            totalLinksProcessed: 0,
            internalLinks: 0,
            externalLinks: 0,
            fragmentLinks: 0,
            brokenLinks: 0,
            errorLinks: 0,
            chaptersWithLinks: 0
        };

        try {
            // Test hyperlink processing on first few chapters
            const chapters = reader.getChapterList();
            const chaptersToTest = Math.min(5, chapters.length);

            for (let i = 0; i < chaptersToTest; i++) {
                const chapter = chapters[i];

                try {
                    const rawContent = await reader.getChapterContent(chapter.id);

                    // Check if chapter has any links before processing
                    const originalLinks = rawContent.match(/<a[^>]*href=/gi);
                    if (originalLinks && originalLinks.length > 0) {
                        results.chaptersWithLinks++;

                        // Process hyperlinks
                        const processedContent = reader.getRawHtmlContent(rawContent, filename);

                        // Analyze processed links
                        const processedLinks = processedContent.match(/<a[^>]*href=/gi) || [];
                        const internalLinkMatches = processedContent.match(/<a[^>]*data-internal-link="true"/gi) || [];
                        const brokenLinkMatches = processedContent.match(/<span[^>]*class="broken-link"/gi) || [];

                        results.totalLinksProcessed += originalLinks.length;
                        results.internalLinks += internalLinkMatches.length;
                        results.brokenLinks += brokenLinkMatches.length;

                        this.log(`Chapter "${chapter.title}": ${originalLinks.length} original links, ${internalLinkMatches.length} internal, ${brokenLinkMatches.length} broken`);
                    }
                } catch (error) {
                    this.log(`Error testing hyperlinks in chapter "${chapter.title}": ${error.message}`, 'error');
                }
            }

            if (results.totalLinksProcessed > 0) {
                this.log(`Hyperlink processing summary: ${results.totalLinksProcessed} total, ${results.internalLinks} internal, ${results.brokenLinks} broken`);
            } else {
                this.log('No hyperlinks found to test');
            }

        } catch (error) {
            this.log(`Error testing hyperlink processing: ${error.message}`, 'error');
            results.error = error.message;
        }

        const success = results.totalLinksProcessed === 0 || (results.internalLinks > 0 && results.errorLinks === 0);
        this.log(`Hyperlink processing test ${success ? 'PASSED' : 'FAILED'}`);

        return {
            success,
            details: results
        };
    }

    /**
     * Run tests on all EPUB files in the data directory and subdirectories
     */
    async runAllTests() {
        this.log('Starting comprehensive EPUB functionality tests');
        this.log(`Data directory: ${this.dataDir}`);

        try {
            // Find all EPUB files recursively
            const allEpubFiles = this.findAllEpubFiles(this.dataDir);

            if (allEpubFiles.length === 0) {
                this.log('No EPUB files found in data directory or subdirectories', 'warning');
                return { success: false, message: 'No EPUB files found' };
            }

            this.log(`Found ${allEpubFiles.length} EPUB files to test (including subdirectories)`);

            // Group by directory for better organization
            const filesByDir = {};
            allEpubFiles.forEach(file => {
                if (!filesByDir[file.directory]) {
                    filesByDir[file.directory] = [];
                }
                filesByDir[file.directory].push(file);
            });

            this.log('Files found by directory:');
            Object.keys(filesByDir).forEach(dir => {
                this.log(`  ${dir === '.' ? 'Root' : dir}: ${filesByDir[dir].length} files`);
                filesByDir[dir].forEach(file => {
                    this.log(`    - ${file.filename}`);
                });
            });

            const testResults = [];
            let passedTests = 0;
            const improvementStats = {
                flowUsed: 0,
                lowCompleteness: 0,
                navigationPassed: 0,
                hyperlinksPassed: 0,
                totalLinksProcessed: 0,
                titleResolution: {
                    totalChapters: 0,
                    resolvedTitles: 0,
                    defaultTitles: 0,
                    contentExtractedTitles: 0
                }
            };

            for (const fileInfo of allEpubFiles) {
                const result = await this.testEpubFileWithPath(fileInfo);
                testResults.push(result);

                if (result.success) {
                    passedTests++;
                }

                // Collect improvement statistics
                if (result.parsingTest) {
                    if (result.parsingTest.flowUsed) improvementStats.flowUsed++;
                    if (result.parsingTest.contentCompleteness < 90) improvementStats.lowCompleteness++;

                    // Collect title resolution stats (content-only approach)
                    if (result.parsingTest.titleResolutionStats) {
                        improvementStats.titleResolution.totalChapters += result.parsingTest.titleResolutionStats.totalChapters;
                        improvementStats.titleResolution.resolvedTitles += result.parsingTest.titleResolutionStats.totalChapters - result.parsingTest.titleResolutionStats.defaultTitles;
                        improvementStats.titleResolution.defaultTitles += result.parsingTest.titleResolutionStats.defaultTitles;
                        improvementStats.titleResolution.contentExtractedTitles += result.parsingTest.titleResolutionStats.contentExtractedTitles;
                    }
                }

                // Collect navigation statistics
                if (result.navigationTest && result.navigationTest.success) {
                    improvementStats.navigationPassed++;
                }

                // Collect hyperlink statistics
                if (result.hyperlinkTest) {
                    improvementStats.totalLinksProcessed += (result.hyperlinkTest.details ? result.hyperlinkTest.details.totalLinksProcessed : 0) || 0;
                    if (result.hyperlinkTest.success) {
                        improvementStats.hyperlinksPassed++;
                    }
                }
            }

            // Summary
            this.log(`\n${'='.repeat(80)}`);
            this.log('TEST SUMMARY');
            this.log(`${'='.repeat(80)}`);
            this.log(`Total files tested: ${allEpubFiles.length}`);
            this.log(`Tests passed: ${passedTests}`);
            this.log(`Tests failed: ${allEpubFiles.length - passedTests}`);
            this.log(`Success rate: ${((passedTests / allEpubFiles.length) * 100).toFixed(1)}%`);

            this.log(`\nPARSING IMPROVEMENTS ANALYSIS:`);
            this.log(`Flow-based parsing used: ${improvementStats.flowUsed}/${allEpubFiles.length} files`);
            this.log(`Files with low completeness (<90%): ${improvementStats.lowCompleteness}/${allEpubFiles.length} files`);

            const titleResolutionRate = improvementStats.titleResolution.totalChapters > 0
                ? (improvementStats.titleResolution.resolvedTitles / improvementStats.titleResolution.totalChapters * 100).toFixed(1)
                : 0;
            this.log(`\nTITLE RESOLUTION ANALYSIS:`);
            this.log(`Total chapters across all books: ${improvementStats.titleResolution.totalChapters}`);
            this.log(`Chapters with meaningful titles: ${improvementStats.titleResolution.resolvedTitles} (${titleResolutionRate}%)`);
            this.log(`Titles extracted from content: ${improvementStats.titleResolution.contentExtractedTitles}`);
            this.log(`Chapters with default titles: ${improvementStats.titleResolution.defaultTitles}`);
            if (improvementStats.titleResolution.defaultTitles > 0) {
                this.log(`Title resolution could be improved for ${improvementStats.titleResolution.defaultTitles} chapters`, 'warning');
            } else {
                this.log('✓ All chapters have meaningful titles');
            }

            this.log(`\nNAVIGATION AND HYPERLINK ANALYSIS:`);
            this.log(`Navigation tests passed: ${improvementStats.navigationPassed}/${allEpubFiles.length} files`);
            this.log(`Hyperlink tests passed: ${improvementStats.hyperlinksPassed}/${allEpubFiles.length} files`);
            this.log(`Total hyperlinks processed: ${improvementStats.totalLinksProcessed} links`);

            // Detailed results by directory
            Object.keys(filesByDir).forEach(dir => {
                this.log(`\n${dir === '.' ? 'ROOT DIRECTORY' : dir.toUpperCase()} RESULTS:`);
                const dirFiles = filesByDir[dir];
                const dirResults = testResults.filter(r =>
                    dirFiles.some(f => f.relativePath === r.filename || f.filename === r.filename)
                );

                dirResults.forEach(result => {
                    if (result.success) {
                        this.log(`✓ ${result.filename}: PASS`);
                    } else {
                        this.log(`✗ ${result.filename}: FAIL - ${result.error || 'See details above'}`, 'error');
                    }
                });
            });

            return {
                success: passedTests === allEpubFiles.length,
                totalFiles: allEpubFiles.length,
                passedTests,
                failedTests: allEpubFiles.length - passedTests,
                results: testResults,
                improvementStats,
                filesByDirectory: filesByDir
            };

        } catch (error) {
            this.log(`Error running tests: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Run a quick test on a single file (for development)
     */
    async runQuickTest(filename = null) {
        try {
            const files = fs.readdirSync(this.dataDir);
            const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));

            if (epubFiles.length === 0) {
                this.log('No EPUB files found for quick test', 'error');
                return false;
            }

            const testFile = filename || epubFiles[0];
            this.log(`Running quick test on: ${testFile}`);

            const result = await this.testEpubFile(testFile);
            return result.success;

        } catch (error) {
            this.log(`Quick test failed: ${error.message}`, 'error');
            return false;
        }
    }
}

// Export for use in other modules
module.exports = EpubFunctionalityTester;

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new EpubFunctionalityTester();

    // Check command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--quick')) {
        // Run quick test
        const filename = args.find(arg => arg.endsWith('.epub'));
        tester.runQuickTest(filename)
            .then(success => {
                process.exit(success ? 0 : 1);
            })
            .catch(error => {
                console.error('Test execution failed:', error);
                process.exit(1);
            });
    } else {
        // Run all tests
        tester.runAllTests()
            .then(results => {
                process.exit(results.success ? 0 : 1);
            })
            .catch(error => {
                console.error('Test execution failed:', error);
                process.exit(1);
            });
    }
}
