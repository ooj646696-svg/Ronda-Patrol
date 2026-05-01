/**
 * Toast Service
 * Simple toast notifications using React Native Alert
 */
import { Alert, Platform } from 'react-native';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  duration?: number;
  title?: string;
}

class ToastService {
  private toastQueue: Array<{ message: string; type: ToastType; options?: ToastOptions }> = [];
  private isShowing = false;

  /**
   * Show a toast notification
   */
  show(message: string, type: ToastType = 'info', options?: ToastOptions) {
    if (this.isShowing) {
      this.toastQueue.push({ message, type, options });
      return;
    }

    this.showToast(message, type, options);
  }

  private async showToast(message: string, type: ToastType, options?: ToastOptions) {
    this.isShowing = true;

    // Use Alert for simplicity since react-native doesn't have built-in toast
    const title = options?.title || this.getDefaultTitle(type);
    
    Alert.alert(title, message, [
      { text: 'OK', onPress: () => this.processQueue() }
    ], { cancelable: true });
  }

  private getDefaultTitle(type: ToastType): string {
    switch (type) {
      case 'success':
        return '✅ Success';
      case 'error':
        return '❌ Error';
      case 'warning':
        return '⚠️ Warning';
      case 'info':
      default:
        return 'ℹ️ Info';
    }
  }

  private processQueue() {
    this.isShowing = false;
    if (this.toastQueue.length > 0) {
      const next = this.toastQueue.shift();
      if (next) {
        this.showToast(next.message, next.type, next.options);
      }
    }
  }

  // Convenience methods
  success(message: string, options?: ToastOptions) {
    this.show(message, 'success', options);
  }

  error(message: string, options?: ToastOptions) {
    this.show(message, 'error', options);
  }

  warning(message: string, options?: ToastOptions) {
    this.show(message, 'warning', options);
  }

  info(message: string, options?: ToastOptions) {
    this.show(message, 'info', options);
  }
}

export const toastService = new ToastService();
