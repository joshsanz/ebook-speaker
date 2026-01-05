const bcrypt = require('bcryptjs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PASSWORD_MIN_LENGTH = 12;
const DEFAULT_BCRYPT_COST = 12;

const PASSWORD_MIN_LENGTH = Number.parseInt(
    process.env.PASSWORD_MIN_LENGTH || DEFAULT_PASSWORD_MIN_LENGTH,
    10
);
const BCRYPT_COST = Number.parseInt(
    process.env.BCRYPT_COST || DEFAULT_BCRYPT_COST,
    10
);

function normalizeEmail(email) {
    if (typeof email !== 'string') {
        return '';
    }

    return email.trim().toLowerCase();
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    return EMAIL_REGEX.test(email.trim());
}

function validatePassword(password) {
    const issues = [];

    if (!password || typeof password !== 'string') {
        issues.push('Password must be a string');
        return { isValid: false, issues };
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        issues.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    if (!/[A-Za-z]/.test(password)) {
        issues.push('Password must include at least one letter');
    }

    if (!/[0-9]/.test(password)) {
        issues.push('Password must include at least one number');
    }

    return { isValid: issues.length === 0, issues };
}

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, BCRYPT_COST, (error, hash) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(hash);
        });
    });
}

function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        bcrypt.compare(password, hash, (error, match) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(match);
        });
    });
}

module.exports = {
    normalizeEmail,
    validateEmail,
    validatePassword,
    hashPassword,
    verifyPassword,
    PASSWORD_MIN_LENGTH,
    BCRYPT_COST
};
