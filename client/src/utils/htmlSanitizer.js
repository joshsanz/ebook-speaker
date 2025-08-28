/**
 * Client-side HTML Sanitization utilities for EPUB Speaker
 * 
 * Uses DOMPurify library to provide an additional layer of XSS protection
 * on the client side as defense-in-depth.
 */

import DOMPurify from 'dompurify';

/**
 * Configuration for client-side EPUB content sanitization
 * More restrictive than server-side to ensure maximum security
 */
const EPUB_CLIENT_CONFIG = {
    // Allow only essential elements for display
    ALLOWED_TAGS: [
        'p', 'div', 'span', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
        'blockquote', 'pre', 'code', 'address',
        'a', 'img',
        'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
        'figure', 'figcaption', 'abbr', 'cite', 'q', 'time', 'dfn'
    ],
    
    // Allowed attributes - very restrictive
    ALLOWED_ATTR: [
        'id', 'class', 'title', 'lang',
        'data-sentence-index', 'data-chapter-id', 'data-internal-link',
        'href', 'target', 'rel',
        'src', 'alt', 'width', 'height',
        'colspan', 'rowspan', 'scope'
    ],
    
    // Allowed URL schemes
    ALLOWED_SCHEMES: ['http', 'https', 'mailto', 'tel'],
    
    // Additional security settings
    KEEP_CONTENT: true,
    FORBID_TAGS: [
        'script', 'object', 'embed', 'applet', 'iframe', 'frame', 'frameset',
        'form', 'input', 'button', 'textarea', 'select', 'option',
        'meta', 'link', 'style', 'base', 'title', 'head', 'html', 'body'
    ],
    FORBID_ATTR: [
        // All event handlers
        'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 
        'onmousemove', 'onmouseout', 'onkeypress', 'onkeydown', 'onkeyup',
        'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onload',
        'onunload', 'onerror', 'onabort', 'onresize', 'onscroll',
        // Dangerous attributes
        'action', 'method', 'enctype', 'formaction', 'formmethod',
        'autofocus', 'autoplay', 'controls', 'data', 'codebase', 'archive',
        // Style attribute (removed for security)
        'style'
    ]
};

/**
 * Sanitize HTML content for display in the BookReader component
 * This provides client-side defense-in-depth protection
 * @param {string} htmlContent - HTML content to sanitize
 * @returns {string} Sanitized HTML safe for dangerouslySetInnerHTML
 */
function sanitizeForDisplay(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return '';
    }
    
    try {
        // Use DOMPurify to sanitize the content
        const sanitized = DOMPurify.sanitize(htmlContent, EPUB_CLIENT_CONFIG);
        
        // Log if significant content was removed (development only)
        if (process.env.NODE_ENV === 'development') {
            const originalLength = htmlContent.length;
            const sanitizedLength = sanitized.length;
            const removed = originalLength - sanitizedLength;
            
            if (removed > 50) {
                console.log(`[Security] Client-side sanitization removed ${removed} characters`);
            }
        }
        
        return sanitized;
    } catch (error) {
        console.error('Client-side HTML sanitization error:', error);
        // Return empty content if sanitization fails
        return '<p>Content could not be displayed safely.</p>';
    }
}

/**
 * Additional hook to sanitize URLs in links and images
 */
DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    // Sanitize href attributes in links
    if (node.tagName === 'A' && node.hasAttribute('href')) {
        const href = node.getAttribute('href');
        
        // Remove javascript:, data:, vbscript: and other dangerous protocols
        if (/^(?:javascript|data|vbscript|file|about):/i.test(href)) {
            node.removeAttribute('href');
            console.warn('[Security] Removed dangerous URL from link:', href.substring(0, 50));
        }
        // Ensure external links are safe
        else if (href.match(/^https?:\/\//)) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    }
    
    // Sanitize src attributes in images
    if (node.tagName === 'IMG' && node.hasAttribute('src')) {
        const src = node.getAttribute('src');
        
        // Remove dangerous protocols (except data: for images)
        if (/^(?:javascript|vbscript|file|about):/i.test(src)) {
            node.removeAttribute('src');
            node.setAttribute('alt', '[Image removed for security]');
            console.warn('[Security] Removed dangerous URL from image:', src.substring(0, 50));
        }
    }
});

/**
 * Check if the current content appears to be sanitized
 * @param {string} htmlContent - HTML content to check
 * @returns {boolean} True if content appears safe
 */
function isContentSafe(htmlContent) {
    if (!htmlContent) return true;
    
    // Quick check for obvious dangerous patterns
    const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(htmlContent));
}

/**
 * Sanitize content with extra strict rules for untrusted sources
 * @param {string} htmlContent - HTML content to sanitize
 * @returns {string} Strictly sanitized content
 */
function strictSanitize(htmlContent) {
    const strictConfig = {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i'],
        ALLOWED_ATTR: ['class'],
        KEEP_CONTENT: true
    };
    
    return DOMPurify.sanitize(htmlContent, strictConfig);
}

export {
    sanitizeForDisplay,
    isContentSafe,
    strictSanitize,
    EPUB_CLIENT_CONFIG
};