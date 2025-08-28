/**
 * Secure File Upload utilities for EPUB Speaker
 * 
 * Provides comprehensive file upload security including type validation,
 * size limits, filename sanitization, and malware scanning capabilities.
 */

const fileType = require('file-type');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { sanitizeFilename } = require('./security');

// Security constants
const ALLOWED_MIME_TYPES = [
    'application/epub+zip',
    'application/zip' // EPUB files may be detected as generic ZIP
];

const ALLOWED_FILE_EXTENSIONS = ['.epub'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit for large audiobooks
const MIN_FILE_SIZE = 1024; // 1KB minimum to prevent empty files
const MAX_FILES_PER_UPLOAD = 1; // Only allow single file uploads

// EPUB file signature validation
const EPUB_SIGNATURES = {
    ZIP_HEADER: Buffer.from([0x50, 0x4B, 0x03, 0x04]), // Standard ZIP header
    ZIP_HEADER_ALT: Buffer.from([0x50, 0x4B, 0x05, 0x06]) // ZIP central directory end
};

/**
 * Validates if a file is a legitimate EPUB file
 * @param {Buffer} fileBuffer - The file content as a buffer
 * @param {string} originalName - Original filename
 * @returns {Promise<Object>} Validation result with details
 */
async function validateEpubFile(fileBuffer, originalName) {
    const validation = {
        isValid: false,
        errors: [],
        warnings: [],
        fileInfo: {}
    };

    try {
        // Check file size
        if (fileBuffer.length < MIN_FILE_SIZE) {
            validation.errors.push('File too small - possible empty or corrupt file');
            return validation;
        }

        if (fileBuffer.length > MAX_FILE_SIZE) {
            validation.errors.push(`File too large - maximum size is ${MAX_FILE_SIZE / (1024*1024)}MB`);
            return validation;
        }

        // Check file extension
        const ext = path.extname(originalName).toLowerCase();
        if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
            validation.errors.push(`Invalid file extension. Only ${ALLOWED_FILE_EXTENSIONS.join(', ')} allowed`);
            return validation;
        }

        // Check file signature (magic bytes)
        const hasValidZipSignature = EPUB_SIGNATURES.ZIP_HEADER.equals(fileBuffer.slice(0, 4)) ||
                                   EPUB_SIGNATURES.ZIP_HEADER_ALT.equals(fileBuffer.slice(0, 4));

        if (!hasValidZipSignature) {
            validation.errors.push('Invalid file format - not a valid ZIP/EPUB file');
            return validation;
        }

        // Use file-type library for additional validation
        const detectedType = await fileType.fromBuffer(fileBuffer);
        
        if (detectedType) {
            validation.fileInfo.detectedMime = detectedType.mime;
            validation.fileInfo.detectedExt = detectedType.ext;
            
            // Validate detected MIME type
            if (!ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
                validation.warnings.push(`Detected MIME type (${detectedType.mime}) not in whitelist, but file appears to be ZIP format`);
            }
        } else {
            validation.warnings.push('Could not detect file type, but ZIP signature is valid');
        }

        // Check for EPUB-specific content
        const fileString = fileBuffer.toString('utf8', 0, Math.min(2048, fileBuffer.length));
        
        // Look for EPUB identifier
        const hasEpubIdentifier = fileString.includes('application/epub+zip') || 
                                 fileString.includes('META-INF/container.xml') ||
                                 fileString.includes('mimetype');

        if (!hasEpubIdentifier) {
            validation.warnings.push('File appears to be ZIP but may not be a valid EPUB');
        }

        // Check for suspicious content patterns
        const suspiciousPatterns = [
            /\.exe\x00/gi,  // Executable files
            /\.bat\x00/gi,  // Batch files
            /\.scr\x00/gi,  // Screen saver executables
            /\.vbs\x00/gi,  // VBScript files
            /\.js\x00/gi,   // JavaScript files (suspicious in EPUB)
            /<script\b/gi,  // Script tags (should not be in EPUB structure files)
        ];

        suspiciousPatterns.forEach((pattern, index) => {
            if (pattern.test(fileString)) {
                validation.warnings.push(`Suspicious content detected (pattern ${index + 1})`);
            }
        });

        validation.isValid = validation.errors.length === 0;
        validation.fileInfo.size = fileBuffer.length;
        validation.fileInfo.originalName = originalName;

        return validation;

    } catch (error) {
        validation.errors.push(`File validation error: ${error.message}`);
        return validation;
    }
}

/**
 * Generate a secure filename for storage
 * @param {string} originalName - Original filename
 * @param {string} userId - User ID (for future multi-user support)
 * @returns {string} Secure filename
 */
function generateSecureFilename(originalName, userId = 'anonymous') {
    try {
        // Extract extension
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        
        // Sanitize the base name
        const sanitizedBase = sanitizeFilename(baseName);
        
        // Generate unique identifier
        const timestamp = Date.now();
        const randomId = crypto.randomBytes(8).toString('hex');
        
        // Create secure filename: sanitized_name_timestamp_randomid.ext
        const secureFilename = `${sanitizedBase}_${timestamp}_${randomId}${ext}`;
        
        // Ensure filename isn't too long (filesystem limit)
        if (secureFilename.length > 255) {
            const truncatedBase = sanitizedBase.substring(0, 200);
            return `${truncatedBase}_${timestamp}_${randomId}${ext}`;
        }
        
        return secureFilename;
    } catch (error) {
        // Fallback to completely random filename
        const randomName = crypto.randomBytes(16).toString('hex');
        return `upload_${randomName}.epub`;
    }
}

/**
 * Calculate file hash for duplicate detection and integrity checking
 * @param {Buffer} fileBuffer - File content
 * @returns {string} SHA-256 hash of the file
 */
function calculateFileHash(fileBuffer) {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Create secure storage path based on file hash and user
 * @param {string} fileHash - Hash of the file
 * @param {string} userId - User ID
 * @returns {string} Secure storage directory path
 */
function createSecureStoragePath(fileHash, userId = 'shared') {
    // Create directory structure: data/userId/hashPrefix/
    const hashPrefix = fileHash.substring(0, 4); // First 4 chars of hash
    return path.join('data', userId, hashPrefix);
}

/**
 * Check if uploaded file is a duplicate
 * @param {string} fileHash - Hash of the uploaded file
 * @param {string} dataDir - Base data directory
 * @returns {Promise<Object>} Duplicate check result
 */
async function checkForDuplicates(fileHash, dataDir) {
    try {
        // This is a simplified duplicate check
        // In a full implementation, you'd maintain a hash database
        const result = {
            isDuplicate: false,
            existingPath: null,
            message: null
        };

        // For now, just return no duplicates
        // TODO: Implement proper duplicate detection with database
        return result;
    } catch (error) {
        return {
            isDuplicate: false,
            existingPath: null,
            message: `Duplicate check failed: ${error.message}`
        };
    }
}

/**
 * Quarantine a suspicious file for manual review
 * @param {Buffer} fileBuffer - File content
 * @param {string} originalName - Original filename
 * @param {Array} warnings - Security warnings
 * @returns {Promise<string>} Quarantine path
 */
async function quarantineFile(fileBuffer, originalName, warnings) {
    try {
        const quarantineDir = path.join(__dirname, '..', 'quarantine');
        await fs.mkdir(quarantineDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const quarantineFileName = `${timestamp}_${sanitizeFilename(originalName)}`;
        const quarantinePath = path.join(quarantineDir, quarantineFileName);
        
        // Write file to quarantine
        await fs.writeFile(quarantinePath, fileBuffer);
        
        // Write warning information
        const infoFile = quarantinePath + '.info.json';
        const info = {
            originalName,
            quarantineTime: new Date().toISOString(),
            warnings,
            fileSize: fileBuffer.length,
            fileHash: calculateFileHash(fileBuffer)
        };
        await fs.writeFile(infoFile, JSON.stringify(info, null, 2));
        
        return quarantinePath;
    } catch (error) {
        throw new Error(`Quarantine failed: ${error.message}`);
    }
}

/**
 * Comprehensive file upload validation pipeline
 * @param {Buffer} fileBuffer - File content
 * @param {string} originalName - Original filename
 * @param {Object} options - Additional validation options
 * @returns {Promise<Object>} Complete validation result
 */
async function validateFileUpload(fileBuffer, originalName, options = {}) {
    const result = {
        isValid: false,
        shouldQuarantine: false,
        errors: [],
        warnings: [],
        fileInfo: {},
        secureFilename: null,
        fileHash: null,
        storagePath: null
    };

    try {
        // Basic EPUB validation
        const epubValidation = await validateEpubFile(fileBuffer, originalName);
        result.errors.push(...epubValidation.errors);
        result.warnings.push(...epubValidation.warnings);
        result.fileInfo = epubValidation.fileInfo;

        if (epubValidation.errors.length > 0) {
            return result; // Stop processing if basic validation fails
        }

        // Calculate file hash
        result.fileHash = calculateFileHash(fileBuffer);

        // Check for duplicates
        const duplicateCheck = await checkForDuplicates(result.fileHash, options.dataDir || './data');
        if (duplicateCheck.isDuplicate) {
            result.warnings.push(`Duplicate file detected: ${duplicateCheck.existingPath}`);
        }

        // Generate secure filename
        result.secureFilename = generateSecureFilename(originalName, options.userId);

        // Create storage path
        result.storagePath = createSecureStoragePath(result.fileHash, options.userId);

        // Determine if file should be quarantined
        const highRiskWarnings = result.warnings.filter(w => 
            w.includes('Suspicious content') || w.includes('not a valid EPUB')
        );

        result.shouldQuarantine = highRiskWarnings.length > 0 && options.strictMode;

        result.isValid = result.errors.length === 0 && !result.shouldQuarantine;

        return result;

    } catch (error) {
        result.errors.push(`Validation pipeline error: ${error.message}`);
        return result;
    }
}

module.exports = {
    validateEpubFile,
    validateFileUpload,
    generateSecureFilename,
    calculateFileHash,
    createSecureStoragePath,
    checkForDuplicates,
    quarantineFile,
    MAX_FILE_SIZE,
    MIN_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    ALLOWED_FILE_EXTENSIONS
};