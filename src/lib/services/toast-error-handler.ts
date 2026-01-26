import { toast } from 'sonner';

export enum ToastErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  VALIDATION = 'VALIDATION',
  SERVER = 'SERVER',
  WEBHOOK = 'WEBHOOK',
  SYNC = 'SYNC',
  UNKNOWN = 'UNKNOWN',
}

export interface ToastError {
  type: ToastErrorType;
  message: string;
  code?: string;
  details?: unknown;
  timestamp: Date;
  endpoint?: string;
  requestId?: string;
}

export class ToastErrorHandler {
  private static instance: ToastErrorHandler;
  private errorLog: ToastError[] = [];
  private maxLogSize = 1000;

  public static getInstance(): ToastErrorHandler {
    if (!ToastErrorHandler.instance) {
      ToastErrorHandler.instance = new ToastErrorHandler();
    }
    return ToastErrorHandler.instance;
  }

  /**
   * Handle and categorize Toast API errors
   */
  public handleError(error: unknown, endpoint?: string, showToast = true): ToastError {
    const toastError = this.categorizeError(error, endpoint);
    
    // Log the error
    this.logError(toastError);
    
    // Show toast notification if requested and we're on the client side
    if (showToast && typeof window !== 'undefined') {
      this.showErrorToast(toastError);
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Toast API Error:', toastError);
    }
    
    return toastError;
  }

  /**
   * Categorize error based on type and content
   */
  private categorizeError(error: unknown, endpoint?: string): ToastError {
    const timestamp = new Date();
    let type = ToastErrorType.UNKNOWN;
    let message = 'An unknown error occurred';
    let code: string | undefined;
    let details: unknown;

    if (error instanceof Error) {
      message = error.message;
      
      // Network errors
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        type = ToastErrorType.NETWORK;
        message = 'Network connection failed. Please check your internet connection.';
      }
      
      // Authentication errors
      else if (error.message.includes('authentication') || error.message.includes('unauthorized') || error.message.includes('401')) {
        type = ToastErrorType.AUTHENTICATION;
        message = 'Authentication failed. Please check your Toast API credentials.';
      }
      
      // Rate limit errors
      else if (error.message.includes('rate limit') || error.message.includes('429')) {
        type = ToastErrorType.RATE_LIMIT;
        message = 'Rate limit exceeded. Please wait before making more requests.';
      }
      
      // Validation errors
      else if (error.message.includes('validation') || error.message.includes('400')) {
        type = ToastErrorType.VALIDATION;
        message = 'Invalid request data. Please check your input.';
      }
      
      // Server errors
      else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
        type = ToastErrorType.SERVER;
        message = 'Toast server error. Please try again later.';
      }
    }
    
    // HTTP response errors
    else if (typeof error === 'object' && error !== null && 'status' in error) {
      const httpError = error as { status: number; message?: string; body?: unknown; details?: unknown };
      code = httpError.status.toString();
      
      switch (httpError.status) {
        case 401:
          type = ToastErrorType.AUTHENTICATION;
          message = 'Authentication failed. Please check your Toast API credentials.';
          break;
        case 403:
          type = ToastErrorType.AUTHENTICATION;
          message = 'Access forbidden. Check your API permissions.';
          break;
        case 400:
          type = ToastErrorType.VALIDATION;
          message = httpError.message || 'Invalid request data.';
          break;
        case 429:
          type = ToastErrorType.RATE_LIMIT;
          message = 'Rate limit exceeded. Please wait before making more requests.';
          break;
        case 500:
        case 502:
        case 503:
          type = ToastErrorType.SERVER;
          message = 'Toast server error. Please try again later.';
          break;
        default:
          type = ToastErrorType.UNKNOWN;
          message = httpError.message || `HTTP ${httpError.status} error occurred.`;
      }
      
      details = httpError.body || httpError.details;
    }
    
    // String errors
    else if (typeof error === 'string') {
      message = error;
      
      if (message.includes('sync')) {
        type = ToastErrorType.SYNC;
      } else if (message.includes('webhook')) {
        type = ToastErrorType.WEBHOOK;
      }
    }

    return {
      type,
      message,
      code,
      details,
      timestamp,
      endpoint,
      requestId: this.generateRequestId(),
    };
  }

  /**
   * Show appropriate toast notification for error
   */
  private showErrorToast(error: ToastError): void {
    // Only show toasts on client side
    if (typeof window === 'undefined') return;
    
    try {
      const toastOptions = {
        duration: this.getToastDuration(error.type),
        id: error.requestId,
      };

      switch (error.type) {
        case ToastErrorType.AUTHENTICATION:
          toast.error(error.message, toastOptions);
          break;
        case ToastErrorType.NETWORK:
          toast.error(error.message, toastOptions);
          break;
        case ToastErrorType.RATE_LIMIT:
          toast.error(error.message, toastOptions);
          break;
        case ToastErrorType.VALIDATION:
          toast.error(error.message, toastOptions);
          break;
        case ToastErrorType.SERVER:
          toast.error(error.message, toastOptions);
          break;
        case ToastErrorType.WEBHOOK:
          toast.error(`Webhook Error: ${error.message}`, toastOptions);
          break;
        case ToastErrorType.SYNC:
          toast.error(`Sync Error: ${error.message}`, toastOptions);
          break;
        default:
          toast.error(error.message, toastOptions);
      }
    } catch (toastError) {
      // Fallback if toast library isn't available
      console.error('Failed to show toast notification:', toastError);
    }
  }

  /**
   * Get toast duration based on error type
   */
  private getToastDuration(type: ToastErrorType): number {
    switch (type) {
      case ToastErrorType.AUTHENTICATION:
        return 8000; // Longer for auth errors
      case ToastErrorType.RATE_LIMIT:
        return 6000;
      case ToastErrorType.SERVER:
        return 6000;
      default:
        return 4000;
    }
  }

  /**
   * Log error to internal array
   */
  private logError(error: ToastError): void {
    this.errorLog.unshift(error);
    
    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }
  }

  /**
   * Generate unique request ID for tracking
   */
  private generateRequestId(): string {
    return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get recent errors
   */
  public getRecentErrors(count = 10): ToastError[] {
    return this.errorLog.slice(0, count);
  }

  /**
   * Get errors by type
   */
  public getErrorsByType(type: ToastErrorType): ToastError[] {
    return this.errorLog.filter(error => error.type === type);
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): Record<ToastErrorType, number> {
    const stats = Object.values(ToastErrorType).reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<ToastErrorType, number>);

    this.errorLog.forEach(error => {
      stats[error.type]++;
    });

    return stats;
  }

  /**
   * Check if there are critical errors
   */
  public hasCriticalErrors(): boolean {
    return this.errorLog.some(error => 
      error.type === ToastErrorType.AUTHENTICATION ||
      error.type === ToastErrorType.SERVER
    );
  }

  /**
   * Get health status based on recent errors
   */
  public getHealthStatus(): 'healthy' | 'warning' | 'critical' {
    const recentErrors = this.getRecentErrors(20);
    
    if (recentErrors.length === 0) {
      return 'healthy';
    }
    
    const criticalErrors = recentErrors.filter(error =>
      error.type === ToastErrorType.AUTHENTICATION ||
      error.type === ToastErrorType.SERVER
    );
    
    if (criticalErrors.length > 0) {
      return 'critical';
    }
    
    const recentErrorsCount = recentErrors.filter(
      error => error.timestamp.getTime() > Date.now() - 5 * 60 * 1000 // Last 5 minutes
    ).length;
    
    if (recentErrorsCount > 5) {
      return 'warning';
    }
    
    return 'healthy';
  }

  /**
   * Handle retry logic for failed requests
   */
  public shouldRetry(error: ToastError, attemptCount: number): boolean {
    const maxRetries = 3;
    
    if (attemptCount >= maxRetries) {
      return false;
    }
    
    // Don't retry authentication or validation errors
    if (error.type === ToastErrorType.AUTHENTICATION || error.type === ToastErrorType.VALIDATION) {
      return false;
    }
    
    // Retry network and server errors
    if (error.type === ToastErrorType.NETWORK || error.type === ToastErrorType.SERVER) {
      return true;
    }
    
    // Don't retry rate limit errors immediately
    if (error.type === ToastErrorType.RATE_LIMIT) {
      return false;
    }
    
    return false;
  }

  /**
   * Get retry delay in milliseconds
   */
  public getRetryDelay(attemptCount: number, error: ToastError): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    
    // Exponential backoff
    let delay = baseDelay * Math.pow(2, attemptCount - 1);
    
    // Add jitter
    delay += Math.random() * 1000;
    
    // Cap at max delay
    delay = Math.min(delay, maxDelay);
    
    // Special handling for rate limits
    if (error.type === ToastErrorType.RATE_LIMIT) {
      delay = Math.max(delay, 60000); // Wait at least 1 minute for rate limits
    }
    
    return delay;
  }
}

export default ToastErrorHandler;