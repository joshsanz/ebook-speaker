const EpubReader = require('./epub-reader');
const path = require('path');

async function demonstrateEpubReader() {
    // Path to the EPUB file
    const epubPath = path.join(__dirname, 'Excession - Iain M. Banks.epub');

    console.log('=== EPUB Reader Demo ===\n');
    console.log(`Reading EPUB file: ${epubPath}\n`);

    try {
        // Create reader instance
        const reader = new EpubReader(epubPath);

        // Initialize the reader
        console.log('Initializing EPUB reader...');
        await reader.initialize();

        // Display book metadata
        console.log('\n=== BOOK METADATA ===');
        const metadata = reader.getMetadata();
        if (metadata) {
            console.log(`Title: ${metadata.title || 'N/A'}`);
            console.log(`Author: ${metadata.creator || 'N/A'}`);
            console.log(`Publisher: ${metadata.publisher || 'N/A'}`);
            console.log(`Language: ${metadata.language || 'N/A'}`);
            console.log(`Date: ${metadata.date || 'N/A'}`);
            if (metadata.description) {
                console.log(`Description: ${metadata.description.substring(0, 200)}...`);
            }
        }

        // Display chapter list
        reader.displayChapterList();

        // Ask user what they want to do
        console.log('Options:');
        console.log('1. Display all chapters with content previews');
        console.log('2. Display specific chapter content');
        console.log('3. Just show the chapter list (already shown above)');

        // For demo purposes, let's show the first few chapters with content
        console.log('\n=== SHOWING FIRST 3 CHAPTERS WITH CONTENT PREVIEWS ===\n');

        const chapters = reader.getChapterList();
        const chaptersToShow = Math.min(3, chapters.length);

        for (let i = 0; i < chaptersToShow; i++) {
            const chapter = chapters[i];
            try {
                console.log(`\n--- Chapter ${chapter.order}: ${chapter.title} ---\n`);

                const content = await reader.getChapterContent(chapter.id);
                const cleanContent = reader.cleanHtmlContent(content);

                // Show first 300 characters
                const preview = cleanContent.length > 300
                    ? cleanContent.substring(0, 300) + '...'
                    : cleanContent;

                console.log(preview);
                console.log('\n' + '='.repeat(60));

            } catch (error) {
                console.error(`Error reading chapter ${chapter.title}:`, error.message);
            }
        }

        if (chapters.length > 3) {
            console.log(`\n... and ${chapters.length - 3} more chapters available.`);
        }

        console.log('\n=== Demo completed successfully! ===');

    } catch (error) {
        console.error('Error during EPUB processing:', error);

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

// Run the demonstration
if (require.main === module) {
    demonstrateEpubReader().catch(console.error);
}

module.exports = { demonstrateEpubReader };
