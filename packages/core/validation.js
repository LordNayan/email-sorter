/**
 * Validate required fields in an object
 * @param {object} obj 
 * @param {string[]} requiredFields 
 * @throws {Error} if validation fails
 */
export function validateRequired(obj, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Validate email format
 * @param {string} email 
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate string type
 * @param {any} value 
 * @returns {boolean}
 */
export function isString(value) {
  return typeof value === 'string';
}

/**
 * Validate array type
 * @param {any} value 
 * @returns {boolean}
 */
export function isArray(value) {
  return Array.isArray(value);
}

/**
 * Sanitize and validate category name
 * @param {string} name 
 * @returns {string}
 */
export function sanitizeCategoryName(name) {
  if (!isString(name)) {
    throw new Error('Category name must be a string');
  }
  
  const sanitized = name.trim();
  
  if (sanitized.length === 0) {
    throw new Error('Category name cannot be empty');
  }
  
  if (sanitized.length > 100) {
    throw new Error('Category name too long (max 100 characters)');
  }
  
  return sanitized;
}

/**
 * Parse and validate pagination cursor
 * @param {string|undefined} cursor 
 * @returns {object|null}
 */
export function parseCursor(cursor) {
  if (!cursor) return null;
  
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

/**
 * Create pagination cursor
 * @param {object} data 
 * @returns {string}
 */
export function createCursor(data) {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64');
}
