import logger from './logger';

// Test logging at different levels
logger.debug('This is a debug message - should not appear with INFO level');
logger.info('This is an info message - should appear');
logger.warn('This is a warning message - should appear');
logger.error('This is an error message - should appear');

// Test changing log level dynamically
logger.setLevel('debug');
logger.debug('This debug message should now appear after changing level to debug');

// Test with object logging
logger.info('Logging object:', { userId: 123, action: 'load_chapter' });

// Reset to INFO level
logger.setLevel('info');
logger.debug('This debug message should not appear after resetting to info level');