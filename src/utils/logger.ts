declare const __APP_VERSION__: string;

type LogType = 'error' | 'warn' | 'info';

interface LogEntry {
  timestamp: number;
  type: LogType;
  message: string;
  details?: any;
  userAgent: string;
}

const MAX_LOGS = 50;

export const logger = {
  log: (type: LogType, message: string, details?: any) => {
    try {
      const logs: LogEntry[] = JSON.parse(localStorage.getItem('lextio-debug-logs') || '[]');
      const newEntry: LogEntry = {
        timestamp: Date.now(),
        type,
        message,
        details: details instanceof Error ? { name: details.name, message: details.message, stack: details.stack } : details,
        userAgent: navigator.userAgent
      };
      
      logs.unshift(newEntry);
      localStorage.setItem('lextio-debug-logs', JSON.stringify(logs.slice(0, MAX_LOGS)));
      
      // Also log to console
      if (type === 'error') console.error(message, details);
      else if (type === 'warn') console.warn(message, details);
      else console.log(message, details);
    } catch (e) {
      console.error('Failed to save log', e);
    }
  },
  error: (message: string, details?: any) => logger.log('error', message, details),
  warn: (message: string, details?: any) => logger.log('warn', message, details),
  info: (message: string, details?: any) => logger.log('info', message, details),
  
  getLogs: (): LogEntry[] => {
    try {
      return JSON.parse(localStorage.getItem('lextio-debug-logs') || '[]');
    } catch (e) {
      return [];
    }
  },
  
  getDebugReport: () => {
    const logs = logger.getLogs();
    const report = {
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.33',
      device: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: (navigator as any).platform,
        screen: `${window.screen.width}x${window.screen.height}`,
      },
      logs
    };
    return JSON.stringify(report, null, 2);
  },
  
  clear: () => localStorage.removeItem('lextio-debug-logs'),
  
  initGlobalHandlers: () => {
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Unhandled Promise Rejection', { 
        reason: event.reason,
        promise: event.promise 
      });
    });
    window.addEventListener('error', (event) => {
      logger.error('Global Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    });
  }
};
