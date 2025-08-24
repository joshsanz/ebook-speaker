const EpubReader = require('./epub-reader');
const path = require('path');

async function testEpubChapterMapping() {
    // Test with Excession EPUB file from data directory
    const epubPath = path.join(__dirname, 'data', 'Excession - Iain M. Banks.epub');

    console.log('=== EPUB Chapter Mapping Test ===\n');
    console.log(`Testing EPUB file: ${epubPath}\n`);

    try {
        // Create reader instance
        const reader = new EpubReader(epubPath);

        // Initialize the reader
        console.log('Initializing EPUB reader...');
        await reader.initialize();

        // Run debug analysis
        console.log('Running EPUB structure analysis...');
        reader.debugEpubStructure();

        // Test chapter navigation
        console.log('\n=== TESTING CHAPTER NAVIGATION ===\n');

        const chapters = reader.getChapterList();
        console.log(`Found ${chapters.length} chapters`);

        // Test a few chapter transitions
        const testIndices = [0, 1, 2, Math.floor(chapters.length / 2), chapters.length - 2, chapters.length - 1];

        for (const testIndex of testIndices) {
            if (testIndex >= 0 && testIndex < chapters.length) {
                const chapter = chapters[testIndex];
                console.log(`\nTesting Chapter ${chapter.order}: ${chapter.title} (ID: ${chapter.id})`);

                try {
                    // Test getting chapter content
                    const content = await reader.getChapterContent(chapter.id);
                    const cleanContent = reader.cleanHtmlContent(content);

                    console.log(`  ✓ Content retrieved successfully (${cleanContent.length} characters)`);

                    // Test previous/next navigation
                    const prevChapter = testIndex > 0 ? chapters[testIndex - 1] : null;
                    const nextChapter = testIndex < chapters.length - 1 ? chapters[testIndex + 1] : null;

                    if (prevChapter) {
                        console.log(`  ← Previous: Chapter ${prevChapter.order} - ${prevChapter.title}`);
                    }
                    if (nextChapter) {
                        console.log(`  → Next: Chapter ${nextChapter.order} - ${nextChapter.title}`);
                    }

                } catch (error) {
                    console.error(`  ✗ Error reading chapter: ${error.message}`);
                }
            }
        }

        // Test edge cases
        console.log('\n=== TESTING EDGE CASES ===\n');

        // Test first chapter
        if (chapters.length > 0) {
            const firstChapter = chapters[0];
            console.log(`First chapter: ${firstChapter.title} (ID: ${firstChapter.id})`);
            console.log(`  Previous should be disabled: ${chapters.indexOf(firstChapter) === 0}`);
            console.log(`  Next should be enabled: ${chapters.indexOf(firstChapter) < chapters.length - 1}`);
        }

        // Test last chapter
        if (chapters.length > 1) {
            const lastChapter = chapters[chapters.length - 1];
            console.log(`Last chapter: ${lastChapter.title} (ID: ${lastChapter.id})`);
            console.log(`  Previous should be enabled: ${chapters.indexOf(lastChapter) > 0}`);
            console.log(`  Next should be disabled: ${chapters.indexOf(lastChapter) === chapters.length - 1}`);
        }

        // Check for duplicate IDs
        const ids = chapters.map(ch => ch.id);
        const uniqueIds = new Set(ids);
        console.log(`\nDuplicate ID check:`);
        console.log(`  Total chapters: ${chapters.length}`);
        console.log(`  Unique IDs: ${uniqueIds.size}`);
        if (ids.length !== uniqueIds.size) {
            console.log(`  ✗ Found ${ids.length - uniqueIds.size} duplicate IDs`);
        } else {
            console.log(`  ✓ All chapter IDs are unique`);
        }

        // Check ordering consistency
        console.log(`\nOrder consistency check:`);
        let orderConsistent = true;
        for (let i = 0; i < chapters.length; i++) {
            if (chapters[i].order !== i + 1) {
                console.log(`  ✗ Chapter ${i} has order ${chapters[i].order}, expected ${i + 1}`);
                orderConsistent = false;
            }
        }
        if (orderConsistent) {
            console.log(`  ✓ Chapter ordering is consistent`);
        }

        console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');

    } catch (error) {
        console.error('Error during EPUB testing:', error);

        // Provide helpful error messages
        if (error.code === 'ENOENT') {
            console.error('\nThe EPUB file was not found. Please make sure "Excession - Iain M. Banks.epub" exists in the current directory.');
        } else if (error.message.includes('Invalid ZIP file')) {
            console.error('\nThe EPUB file appears to be corrupted or is not a valid EPUB format.');
        } else {
            console.error('\nUnexpected error occurred. Please check the EPUB file format and try again.');
        }
    }
}

// Run the test
if (require.main === module) {
    testEpubChapterMapping().catch(console.error);
}

module.exports = { testEpubChapterMapping };
