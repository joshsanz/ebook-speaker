const { EPub } = require('epub2');
const fs = require('fs');
const path = require('path');
const log = require('loglevel');

// Set default log level to INFO to reduce noise, can be changed via log.setLevel()
log.setLevel('INFO');

class EpubReader {
    constructor(epubPathOrBuffer, isBuffer = false, logLevel = 'INFO') {
        // Allow per-instance log level configuration
        if (logLevel) {
            log.setLevel(logLevel);
        }
        if (isBuffer) {
            this.epubBuffer = epubPathOrBuffer;
            this.epubPath = null;
        } else {
            this.epubPath = epubPathOrBuffer;
            this.epubBuffer = null;
        }
        this.epub = null;
        this.chapters = [];
    }

    /**
     * Initialize the EPUB reader and parse the file
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                if (this.epubBuffer) {
                    this.epub = new EPub(this.epubBuffer);
                } else {
                    this.epub = new EPub(this.epubPath);
                }

                this.epub.on('end', () => {
                    log.info('EPUB file parsed successfully');
                    this.extractChapters();
                    resolve();
                });

                this.epub.on('error', (error) => {
                    log.error('Error parsing EPUB:', error);
                    reject(error);
                });

                this.epub.parse();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Extract chapter information from the EPUB using flow property
     */
    extractChapters() {
        this.chapters = [];
        const toc = this.epub.toc;
        const flow = this.epub.flow;
        const spine = this.epub.spine.contents;
        const manifest = this.epub.manifest;

        log.debug(`EPUB Analysis: TOC entries: ${toc?.length || 0}, Flow items: ${flow?.length || 0}, Spine items: ${spine.length}`);

        if (!flow || flow.length === 0) {
            log.error('No flow property available - EPUB may be malformed or use unsupported format');
            return;
        }

        log.debug('Using flow property for chapter extraction');

        flow.forEach((flowItem, index) => {
            const manifestItem = manifest[flowItem.id];

            if (!manifestItem) {
                log.warn(`Flow item ${flowItem.id} not found in manifest`);
                return;
            }

            // Only include XHTML content chapters
            if (manifestItem['media-type'] === 'application/xhtml+xml') {
                const title = this.resolveChapterTitle(flowItem, manifestItem, toc, spine, index);

                this.chapters.push({
                    id: flowItem.id,
                    title: title,
                    href: manifestItem.href,
                    order: index + 1,
                    source: 'flow'
                });
            }
        });

        // Final validation: ensure all chapters have unique IDs and proper ordering
        this.validateAndCleanChapters();
    }

    /**
     * Extract a title from chapter content (first 5 words before newline)
     */
    extractTitleFromContent(chapterId) {
        try {
            // This needs to be synchronous for the flow processing, so we'll return a promise
            // that can be resolved later if needed, but for now we'll skip this step
            // and implement it as an async fallback in resolveChapterTitle
            return null;
        } catch (error) {
            log.debug(`Could not extract title from content for chapter ${chapterId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract title from HTML content text
     */
    extractTitleFromHtmlContent(htmlContent) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            return null;
        }

        try {
            // First, try to extract title from h1, h2, h3 tags directly
            const headerRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/i;
            const headerMatch = htmlContent.match(headerRegex);
            if (headerMatch && headerMatch[1]) {
                // Clean the header content by removing any nested tags
                const headerText = headerMatch[1].replace(/<[^>]*>/g, '').trim();
                if (headerText.length >= 1 && headerText.length <= 50) {
                    return headerText;
                }
            }

            // Fallback to the original method
            // Clean the HTML content to get plain text
            const cleanText = this.cleanHtmlContent(htmlContent);

            if (!cleanText || cleanText.trim().length === 0) {
                return null;
            }

            // Get the first line of content
            const firstLine = cleanText.split('\n')[0].trim();

            if (firstLine.length === 0) {
                return null;
            }

            // Split into words and take first 5
            const words = firstLine.split(/\s+/).filter(word => word.length > 0);

            if (words.length === 0) {
                return null;
            }

            // Take up to 5 words
            const titleWords = words.slice(0, 5);
            let title = titleWords.join(' ');

            // Add ellipses if we truncated and there are more words
            if (words.length > 5) {
                title += '...';
            }

            // Don't use very short titles (less than 3 characters) or very long ones
            if (title.length < 3 || title.length > 50) {
                return null;
            }

            return title;

        } catch (error) {
            log.debug(`Error extracting title from HTML content: ${error.message}`);
            return null;
        }
    }

    /**
     * Resolve the best title for a chapter using content extraction only
     */
    resolveChapterTitle(flowItem, manifestItem, toc, spine, index) {
        let title = `Chapter ${index + 1}`;
        let titleSource = 'default';

        log.debug(`\n--- Resolving title for Chapter ${index + 1} ---`);
        log.debug(`Flow item ID: ${flowItem.id}`);
        log.debug(`Manifest href: ${manifestItem.href}`);

        // Strategy 1: Check if spine has additional title information
        if (spine && spine.length > 0) {
            const spineItem = spine.find(item => item.id === flowItem.id);
            if (spineItem && spineItem.title) {
                title = spineItem.title;
                titleSource = 'spine';
                log.debug(`Chapter ${index + 1}: Found title via spine: "${title}"`);
                return title;
            }
        }

        // Strategy 2: Check manifest for title attribute
        if (manifestItem.title) {
            title = manifestItem.title;
            titleSource = 'manifest';
            log.debug(`Chapter ${index + 1}: Found title via manifest: "${title}"`);
            return title;
        }

        // Strategy 3: Extract title from chapter content as final fallback
        // Note: We'll mark this chapter for content-based title extraction in post-processing
        // since epub.getChapter() is async
        title = `Chapter ${index + 1}`;
        titleSource = 'default';

        // Store info for content-based title extraction
        if (!this.chaptersForContentTitleExtraction) {
            this.chaptersForContentTitleExtraction = [];
        }
        this.chaptersForContentTitleExtraction.push({
            id: flowItem.id,
            index: index,
            defaultTitle: title,
            tocInfo: toc ? toc.find(tocItem => tocItem.id === flowItem.id || tocItem.href === manifestItem.href) : null
        });

        log.debug(`Chapter ${index + 1}: Using default title: "${title}" (will attempt content extraction)`);
        return title;
    }

    /**
     * Validate and clean chapter list to ensure consistency
     */
    validateAndCleanChapters() {
        const originalCount = this.chapters.length;
        log.debug(`Validating ${originalCount} chapters...`);

        // Remove duplicates based on ID
        const seenIds = new Set();
        this.chapters = this.chapters.filter(chapter => {
            if (seenIds.has(chapter.id)) {
                log.warn(`Removing duplicate chapter ID: ${chapter.id} (${chapter.title})`);
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
            log.debug(`Chapter validation complete: ${originalCount} → ${finalCount} chapters`);
        }

        log.debug(`Final chapter list: ${this.chapters.map(c => `${c.order}: ${c.title} (ID: ${c.id})`).join(', ')}`);
    }

    /**
     * Extract titles from content for chapters with default titles
     */
    async improveChapterTitlesFromContent() {
        if (!this.chaptersForContentTitleExtraction || this.chaptersForContentTitleExtraction.length === 0) {
            log.debug('No chapters marked for content-based title extraction');
            return;
        }

        log.debug(`\n=== CONTENT-BASED TITLE EXTRACTION ===`);
        log.debug(`Attempting to extract titles from content for ${this.chaptersForContentTitleExtraction.length} chapters...`);
        let titlesImproved = 0;

        for (const chapterInfo of this.chaptersForContentTitleExtraction) {
            log.debug(`\n--- Processing Chapter ${chapterInfo.index + 1} (ID: ${chapterInfo.id}) ---`);

            try {
                const content = await this.getChapterContent(chapterInfo.id);
                log.debug(`Content length: ${content ? content.length : 0} characters`);

                if (content && content.length > 0) {
                    const contentTitle = this.extractTitleFromHtmlContent(content);
                    log.debug(`Extracted title: "${contentTitle}"`);

                    if (contentTitle) {
                        // Find and update the chapter in our chapters array
                        const chapter = this.chapters.find(ch => ch.id === chapterInfo.id);
                        if (chapter) {
                            const oldTitle = chapter.title;
                            chapter.title = contentTitle;
                            chapter.titleSource = 'content';
                            titlesImproved++;
                            log.debug(`✓ Chapter ${chapterInfo.index + 1}: Updated title "${oldTitle}" → "${contentTitle}"`);
                        } else {
                            log.debug(`✗ Chapter ${chapterInfo.index + 1}: Could not find chapter in chapters array`);
                        }
                    } else {
                        log.debug(`✗ Chapter ${chapterInfo.index + 1}: No title extracted from content`);
                    }
                } else {
                    log.debug(`✗ Chapter ${chapterInfo.index + 1}: No content or empty content`);
                }
            } catch (error) {
                log.debug(`✗ Chapter ${chapterInfo.index + 1}: Content title extraction failed: ${error.message}`);
            }
        }

        log.debug(`\n=== CONTENT EXTRACTION SUMMARY ===`);
        log.debug(`Successfully improved ${titlesImproved}/${this.chaptersForContentTitleExtraction.length} chapter titles from content`);

        // Clear the extraction list
        this.chaptersForContentTitleExtraction = [];
    }

    /**
     * Improve chapter titles by extracting from content (call after initialize)
     */
    async improveChapterTitles() {
        await this.improveChapterTitlesFromContent();
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
     * Build mapping from EPUB file href to chapter ID
     */
    buildHrefToChapterIdMap() {
        if (this.hrefToChapterMap) {
            return this.hrefToChapterMap;
        }

        this.hrefToChapterMap = new Map();

        if (!this.epub || !this.chapters) {
            return this.hrefToChapterMap;
        }

        const manifest = this.epub.manifest;

        this.chapters.forEach(chapter => {
            const manifestItem = manifest[chapter.id];
            if (manifestItem && manifestItem.href) {
                const href = manifestItem.href;

                // Store multiple variations of the href for flexible matching
                const variations = [
                    href,                                    // Original: "OEBPS/chapter1.html"
                    href.replace(/^.*\//, ''),              // Filename only: "chapter1.html"
                    encodeURIComponent(href),               // URL encoded version
                    encodeURIComponent(href.replace(/^.*\//, '')), // URL encoded filename
                    href.replace(/\.(x?html?)$/, ''),       // Without extension: "OEBPS/chapter1"
                    href.replace(/^.*\//, '').replace(/\.(x?html?)$/, '') // Filename without extension: "chapter1"
                ];

                variations.forEach(variation => {
                    this.hrefToChapterMap.set(variation, chapter.id);
                });
            }
        });

        log.debug(`Built href-to-chapter mapping with ${this.hrefToChapterMap.size} entries`);
        return this.hrefToChapterMap;
    }

    /**
     * Resolve an EPUB href to a chapter ID
     */
    resolveHrefToChapterId(href) {
        if (!href) return null;

        const hrefMap = this.buildHrefToChapterIdMap();

        // Clean the href by removing fragments and query parameters
        const cleanHref = href.split('#')[0].split('?')[0];

        // Try multiple resolution strategies
        const attempts = [
            cleanHref,                                     // Exact match
            decodeURIComponent(cleanHref),                 // URL decode
            cleanHref.replace(/^.*\//, ''),               // Just filename
            decodeURIComponent(cleanHref).replace(/^.*\//, ''), // Decoded filename
            cleanHref.replace(/^\/+/, ''),                // Remove leading slashes
            cleanHref.replace(/^\/links\/[^\/]+\//, ''),  // Remove /links/id/ prefix (common pattern)
        ];

        for (const attempt of attempts) {
            if (hrefMap.has(attempt)) {
                return hrefMap.get(attempt);
            }
        }

        // If no exact match, try partial matching on filenames
        const filename = cleanHref.replace(/^.*\//, '');
        for (const [mapHref, chapterId] of hrefMap.entries()) {
            if (mapHref.includes(filename) || filename.includes(mapHref)) {
                log.debug(`Partial match found: ${href} → ${chapterId} (via ${mapHref})`);
                return chapterId;
            }
        }

        return null;
    }

    /**
     * Process hyperlinks in HTML content to work with React routing
     */
    processHyperlinks(htmlContent, bookFilename) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            return htmlContent;
        }

        // Track processed links for debugging
        const processedLinks = [];

        // Process <a> tags with href attributes
        const processedHtml = htmlContent.replace(
            /<a([^>]*?)href\s*=\s*["']([^"']*?)["']([^>]*?)>/gi,
            (match, beforeHref, href, afterHref) => {
                const originalHref = href;
                let newHref = href;
                let linkType = 'external';
                let chapterId = null;
                let fragment = null;

                try {
                    // Skip empty or javascript: links
                    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) {
                        linkType = 'skip';
                        return match;
                    }

                    // External HTTP/HTTPS links - keep unchanged
                    if (/^https?:\/\//.test(href)) {
                        linkType = 'external';
                        processedLinks.push({ original: originalHref, processed: href, type: linkType });
                        return match;
                    }

                    // Fragment-only links (same page anchors) - keep unchanged
                    if (href.startsWith('#')) {
                        linkType = 'fragment';
                        processedLinks.push({ original: originalHref, processed: href, type: linkType });
                        return match;
                    }

                    // Internal EPUB links - convert to React router paths
                    const [hrefPath, fragmentPart] = href.split('#');
                    fragment = fragmentPart;

                    chapterId = this.resolveHrefToChapterId(hrefPath);

                    if (chapterId) {
                        // Build React router path
                        const encodedFilename = encodeURIComponent(bookFilename);
                        newHref = `/book/${encodedFilename}/chapter/${chapterId}`;

                        // Add fragment if present
                        if (fragment) {
                            newHref += `#${fragment}`;
                        }

                        linkType = 'internal';

                        // Add data attributes to help React handle the link
                        const dataAttrs = ` data-internal-link="true" data-chapter-id="${chapterId}"${fragment ? ` data-fragment="${fragment}"` : ''}`;

                        processedLinks.push({
                            original: originalHref,
                            processed: newHref,
                            type: linkType,
                            chapterId,
                            fragment
                        });

                        return `<a${beforeHref}href="${newHref}"${afterHref}${dataAttrs}>`;
                    } else {
                        // Couldn't resolve link - disable it but keep content
                        linkType = 'broken';
                        log.warn(`Could not resolve EPUB link: ${originalHref}`);

                        processedLinks.push({ original: originalHref, processed: null, type: linkType });

                        // Convert to non-functional span but keep styling
                        return `<span${beforeHref}${afterHref} class="broken-link" title="Link destination not found: ${originalHref}">`;
                    }

                } catch (error) {
                    log.error(`Error processing link ${originalHref}:`, error);
                    linkType = 'error';
                    processedLinks.push({ original: originalHref, processed: null, type: linkType, error: error.message });
                    return match; // Return original on error
                }
            }
        );

        // Also handle closing </a> tags for broken links converted to spans
        const finalHtml = processedHtml.replace(/<\/a>/g, (match, offset) => {
            // Check if this </a> should be </span> based on preceding broken link conversion
            const precedingText = processedHtml.substring(Math.max(0, offset - 200), offset);
            if (precedingText.includes('class="broken-link"')) {
                return '</span>';
            }
            return match;
        });

        // Log processing results
        if (processedLinks.length > 0) {
            log.debug(`Processed ${processedLinks.length} hyperlinks:`, {
                internal: processedLinks.filter(l => l.type === 'internal').length,
                external: processedLinks.filter(l => l.type === 'external').length,
                fragments: processedLinks.filter(l => l.type === 'fragment').length,
                broken: processedLinks.filter(l => l.type === 'broken').length,
                errors: processedLinks.filter(l => l.type === 'error').length
            });
        }

        return finalHtml;
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
        log.debug('\n=== EPUB CHAPTERS ===\n');
        log.debug(`Book Title: ${this.epub.metadata.title || 'Unknown'}`);
        log.debug(`Author: ${this.epub.metadata.creator || 'Unknown'}`);
        log.debug(`Total Chapters: ${this.chapters.length}\n`);

        for (const chapter of this.chapters) {
            try {
                log.debug(`\n--- Chapter ${chapter.order}: ${chapter.title} ---\n`);

                const content = await this.getChapterContent(chapter.id);

                // Clean up HTML content for display
                const cleanContent = this.cleanHtmlContent(content);

                // Display first 500 characters of each chapter
                const preview = cleanContent.length > 500
                    ? cleanContent.substring(0, 500) + '...'
                    : cleanContent;

                log.debug(preview);
                log.debug('\n' + '='.repeat(80));

            } catch (error) {
                log.error(`Error reading chapter ${chapter.title}:`, error.message);
            }
        }
    }

    /**
     * Display chapter list only
     */
    displayChapterList() {
        log.debug('\n=== CHAPTER LIST ===\n');
        log.debug(`Book: ${this.epub.metadata.title || 'Unknown'}`);
        log.debug(`Author: ${this.epub.metadata.creator || 'Unknown'}\n`);

        this.chapters.forEach(chapter => {
            log.debug(`${chapter.order}. ${chapter.title}`);
        });
        log.debug(`\nTotal: ${this.chapters.length} chapters\n`);
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
     * Get raw HTML content for web display (preserves formatting and processes hyperlinks)
     */
    getRawHtmlContent(html, bookFilename = null) {
        if (!html) return '';

        // Clean up the HTML but preserve structure for web display
        let cleanHtml = html.replace(/&nbsp;/g, ' ')
                           .replace(/&#8217;/g, "'")
                           .replace(/&#8220;/g, '"')
                           .replace(/&#8221;/g, '"')
                           .replace(/&#8211;/g, '–')
                           .replace(/&#8212;/g, '—');

        // Process hyperlinks if bookFilename is provided
        if (bookFilename) {
            cleanHtml = this.processHyperlinks(cleanHtml, bookFilename);
        }

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
            log.debug('EPUB not initialized');
            return;
        }

        log.debug('\n=== EPUB STRUCTURE DEBUG ===\n');

        log.debug('Metadata:');
        log.debug(`  Title: ${this.epub.metadata.title || 'N/A'}`);
        log.debug(`  Creator: ${this.epub.metadata.creator || 'N/A'}`);
        log.debug(`  Language: ${this.epub.metadata.language || 'N/A'}`);

        log.debug('\nFlow Analysis (epub2 primary):');
        if (this.epub.flow && this.epub.flow.length > 0) {
            log.debug(`  Flow items: ${this.epub.flow.length}`);
            this.epub.flow.forEach((item, index) => {
                const manifestItem = this.epub.manifest[item.id];
                const mediaType = manifestItem ? manifestItem['media-type'] : 'unknown';
                log.debug(`    ${index + 1}. ID: ${item.id}, Media-Type: ${mediaType}, href: ${manifestItem?.href || 'N/A'}`);
            });
        } else {
            log.debug('  No flow found');
        }

        log.debug('\nTOC Analysis:');
        if (this.epub.toc && this.epub.toc.length > 0) {
            log.debug(`  TOC entries: ${this.epub.toc.length}`);
            this.epub.toc.forEach((item, index) => {
                log.debug(`    ${index + 1}. ${item.title} (ID: ${item.id}, href: ${item.href})`);
            });
        } else {
            log.debug('  No TOC found');
        }

        log.debug('\nSpine Analysis:');
        log.debug(`  Spine items: ${this.epub.spine.contents.length}`);
        this.epub.spine.contents.forEach((item, index) => {
            const manifestItem = this.epub.manifest[item.id];
            const mediaType = manifestItem ? manifestItem['media-type'] : 'unknown';
            log.debug(`    ${index + 1}. ID: ${item.id}, Media-Type: ${mediaType}, href: ${manifestItem?.href || 'N/A'}`);
        });

        log.debug('\nManifest Analysis:');
        const manifestEntries = Object.keys(this.epub.manifest);
        const xhtmlEntries = manifestEntries.filter(id =>
            this.epub.manifest[id]['media-type'] === 'application/xhtml+xml'
        );
        log.debug(`  Total manifest entries: ${manifestEntries.length}`);
        log.debug(`  XHTML entries: ${xhtmlEntries.length}`);
        xhtmlEntries.forEach(id => {
            const item = this.epub.manifest[id];
            log.debug(`    ${id}: ${item.href} (${item['media-type']})`);
        });

        log.debug('\nChapter Mapping Analysis:');
        log.debug(`  Final chapters: ${this.chapters.length}`);
        this.chapters.forEach((chapter, index) => {
            log.debug(`    ${index + 1}. ${chapter.title} (ID: ${chapter.id}, Order: ${chapter.order})`);
        });

        log.debug('\n=== END DEBUG ===\n');
    }
}

module.exports = EpubReader;
