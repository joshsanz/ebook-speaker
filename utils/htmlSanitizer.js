/**
 * HTML Sanitization utilities for EPUB Speaker (Server-side)
 * 
 * Uses sanitize-html library to provide secure HTML sanitization
 * for EPUB content while preserving legitimate formatting.
 */

const sanitizeHtml = require('sanitize-html');

/**
 * Configuration for EPUB content sanitization
 * Allows safe HTML elements while blocking XSS vectors
 */
const EPUB_SANITIZE_OPTIONS = {
    // Allow essential HTML elements for EPUB formatting
    allowedTags: [
        // Text formatting
        'p', 'div', 'span', 'br', 'hr',
        
        // Headings
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        
        // Text styling
        'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
        
        // Lists
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        
        // Tables
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
        
        // Block elements
        'blockquote', 'pre', 'code', 'address',
        
        // Links and images (with restrictions)
        'a', 'img',
        
        // Other semantic elements
        'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
        'figure', 'figcaption', 'details', 'summary',
        
        // Definition and abbreviation
        'abbr', 'dfn', 'time', 'cite', 'q'
    ],
    
    // Allowed attributes per tag
    allowedAttributes: {
        '*': ['id', 'class', 'data-sentence-index', 'data-chapter-id', 'title', 'lang'],
        'a': ['href', 'name', 'target'],
        'img': ['src', 'alt', 'width', 'height'],
        'table': ['cellpadding', 'cellspacing', 'border'],
        'th': ['colspan', 'rowspan', 'scope'],
        'td': ['colspan', 'rowspan'],
        'ol': ['type', 'start'],
        'ul': ['type'],
        'li': ['type', 'value']
    },
    
    // Allow specific schemes for URLs
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
        img: ['http', 'https', 'data']
    },
    
    // Disallow relative URLs for security
    allowProtocolRelative: false,
    
    // Simple URL schemes disallowance for safety
    disallowedTagsMode: 'discard'
};

/**
 * Strict sanitization options for user-generated content
 */
const STRICT_SANITIZE_OPTIONS = {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u'],
    allowedAttributes: {
        '*': ['class']
    },
    allowedSchemes: [],
    allowProtocolRelative: false
};

/**
 * Sanitize HTML content for safe display in EPUB reader
 * @param {string} htmlContent - Raw HTML content from EPUB
 * @param {boolean} strict - Use strict sanitization rules
 * @returns {string} Sanitized HTML content safe for display
 */
function sanitizeEpubHtml(htmlContent, strict = false) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return '';
    }
    
    try {
        const options = strict ? STRICT_SANITIZE_OPTIONS : EPUB_SANITIZE_OPTIONS;
        const sanitizedHtml = sanitizeHtml(htmlContent, options);
        
        // Log significant content changes for security monitoring
        const originalLength = htmlContent.length;
        const sanitizedLength = sanitizedHtml.length;
        const removedContent = originalLength - sanitizedLength;
        
        if (removedContent > 100) { // Only log significant removals
            console.log(`[Security] HTML sanitization removed ${removedContent} characters from EPUB content`);
        }
        
        return sanitizedHtml;
    } catch (error) {
        console.error('HTML sanitization error:', error);
        // Return empty string if sanitization fails completely
        return '';
    }
}

/**
 * Analyze HTML content for potential security issues
 * @param {string} htmlContent - HTML content to analyze
 * @returns {Object} Analysis result with security warnings
 */
function analyzeHtmlSecurity(htmlContent) {
    if (!htmlContent) return { safe: true, warnings: [] };
    
    const warnings = [];
    const dangerousPatterns = [
        { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, type: 'Script tags', severity: 'high' },
        { pattern: /on\w+\s*=/gi, type: 'Event handlers', severity: 'high' },
        { pattern: /javascript:/gi, type: 'JavaScript URLs', severity: 'high' },
        { pattern: /vbscript:/gi, type: 'VBScript URLs', severity: 'high' },
        { pattern: /data:(?:text\/html|application\/)/gi, type: 'Dangerous data URLs', severity: 'medium' },
        { pattern: /<iframe\b/gi, type: 'Iframes', severity: 'medium' },
        { pattern: /<object\b/gi, type: 'Object elements', severity: 'medium' },
        { pattern: /<embed\b/gi, type: 'Embed elements', severity: 'medium' },
        { pattern: /<form\b/gi, type: 'Form elements', severity: 'low' },
        { pattern: /expression\s*\(/gi, type: 'CSS expressions', severity: 'high' }
    ];
    
    dangerousPatterns.forEach(({ pattern, type, severity }) => {
        const matches = htmlContent.match(pattern);
        if (matches) {
            warnings.push({
                type: type,
                severity: severity,
                count: matches.length,
                examples: matches.slice(0, 3).map(match => match.substring(0, 50) + '...')
            });
        }
    });
    
    const highSeverityCount = warnings.filter(w => w.severity === 'high').length;
    
    return {
        safe: warnings.length === 0,
        riskLevel: highSeverityCount > 0 ? 'high' : warnings.length > 0 ? 'medium' : 'low',
        warnings: warnings
    };
}

/**
 * Sanitize text content by removing HTML tags completely
 * @param {string} htmlContent - HTML content to convert to plain text
 * @returns {string} Plain text content
 */
function htmlToText(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return '';
    }
    
    // Use sanitize-html to strip all tags
    return sanitizeHtml(htmlContent, {
        allowedTags: [],
        allowedAttributes: {},
        textFilter: function(text) {
            // Clean up whitespace
            return text.replace(/\s+/g, ' ').trim();
        }
    });
}

module.exports = {
    sanitizeEpubHtml,
    analyzeHtmlSecurity,
    htmlToText,
    EPUB_SANITIZE_OPTIONS,
    STRICT_SANITIZE_OPTIONS
};