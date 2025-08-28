/**
 * Security utilities for EPUB Speaker
 * 
 * Provides secure file path validation and sanitization functions
 * to prevent path traversal attacks and other security vulnerabilities.
 */

const path = require('path');
const fs = require('fs');

/**
 * Validates and normalizes a filename to prevent path traversal attacks
 * @param {string} filename - The filename to validate
 * @param {string} baseDir - The base directory that files should be contained within
 * @returns {string} The validated and normalized filename
 * @throws {Error} If the filename is invalid or represents a path traversal attempt
 */
function validateFilename(filename, baseDir) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename provided');
    }
    
    if (!baseDir || typeof baseDir !== 'string') {
        throw new Error('Invalid base directory provided');
    }
    
    // Decode URI component to handle URL encoding
    let decoded;
    try {
        decoded = decodeURIComponent(filename);
    } catch (error) {
        throw new Error('Invalid URI encoding in filename');
    }
    
    // Check for null byte injection
    if (decoded.includes('\0')) {
        throw new Error('Null byte injection detected in filename');
    }
    
    // Normalize the path to resolve any relative components
    const normalizedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(normalizedBase, decoded);
    
    // Ensure the resolved path is within the base directory
    if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
        throw new Error('Path traversal attempt detected');
    }
    
    // Additional security checks
    if (decoded.includes('..')) {
        throw new Error('Relative path components not allowed');
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
        /\.\./,           // Double dots
        /\/\//,           // Double slashes  
        /\\{2,}/,         // Multiple backslashes
        /[<>:"|?*]/,      // Invalid filename characters on Windows
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i  // Windows reserved names
    ];
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(decoded)) {
            throw new Error('Suspicious filename pattern detected');
        }
    }
    
    return decoded;
}

/**
 * Sanitizes a filename for safe storage
 * @param {string} filename - The filename to sanitize
 * @returns {string} The sanitized filename
 */
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename provided for sanitization');
    }
    
    return filename
        .replace(/[^a-zA-Z0-9._-\s]/g, '_')  // Replace unsafe chars with underscore
        .replace(/\.{2,}/g, '.')             // Replace multiple dots with single dot
        .replace(/\s+/g, '_')                // Replace spaces with underscores
        .replace(/_{2,}/g, '_')              // Replace multiple underscores with single
        .substring(0, 255)                   // Limit length to prevent filesystem issues
        .replace(/^\.+/, '')                 // Remove leading dots
        .replace(/\.+$/, '');                // Remove trailing dots
}

/**
 * Validates a file path exists and is within the allowed directory
 * @param {string} filePath - The full file path to validate
 * @param {string} baseDir - The base directory that should contain the file
 * @returns {boolean} True if the file exists and is safe to access
 */
function validateFileAccess(filePath, baseDir) {
    try {
        const normalizedBase = path.resolve(baseDir);
        const normalizedPath = path.resolve(filePath);
        
        // Ensure path is within base directory
        if (!normalizedPath.startsWith(normalizedBase + path.sep) && normalizedPath !== normalizedBase) {
            return false;
        }
        
        // Check if file exists and is readable
        return fs.existsSync(normalizedPath) && fs.lstatSync(normalizedPath).isFile();
    } catch (error) {
        return false;
    }
}

/**
 * Creates a secure file path by combining base directory with validated filename
 * @param {string} baseDir - The base directory
 * @param {string} filename - The filename to validate and append
 * @returns {string} The secure file path
 * @throws {Error} If the filename is invalid
 */
function createSecurePath(baseDir, filename) {
    const validatedFilename = validateFilename(filename, baseDir);
    return path.join(baseDir, validatedFilename);
}

module.exports = {
    validateFilename,
    sanitizeFilename,
    validateFileAccess,
    createSecurePath
};