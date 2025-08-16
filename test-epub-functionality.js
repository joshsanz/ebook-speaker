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
     * Run tests on all EPUB files in the data directory
     */
    async runAllTests() {
        this.log('Starting comprehensive EPUB functionality tests');
        this.log(`Data directory: ${this.dataDir}`);

        try {
            const files = fs.readdirSync(this.dataDir);
            const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));

            if (epubFiles.length === 0) {
                this.log('No EPUB files found in data directory', 'warning');
                return { success: false, message: 'No EPUB files found' };
            }

            this.log(`Found ${epubFiles.length} EPUB files to test`);

            const testResults = [];
            let passedTests = 0;

            for (const filename of epubFiles) {
                const result = await this.testEpubFile(filename);
                testResults.push(result);

                if (result.success) {
                    passedTests++;
                }
            }

            // Summary
            this.log(`\n${'='.repeat(60)}`);
            this.log('TEST SUMMARY');
            this.log(`${'='.repeat(60)}`);
            this.log(`Total files tested: ${epubFiles.length}`);
            this.log(`Tests passed: ${passedTests}`);
            this.log(`Tests failed: ${epubFiles.length - passedTests}`);
            this.log(`Success rate: ${((passedTests / epubFiles.length) * 100).toFixed(1)}%`);

            // Detailed results
            testResults.forEach(result => {
                if (result.success) {
                    this.log(`✓ ${result.filename}: PASS`);
                } else {
                    this.log(`✗ ${result.filename}: FAIL - ${result.error || 'See details above'}`, 'error');
                }
            });

            return {
                success: passedTests === epubFiles.length,
                totalFiles: epubFiles.length,
                passedTests,
                failedTests: epubFiles.length - passedTests,
                results: testResults
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
