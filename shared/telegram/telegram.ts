/**
 * Telegram Web App SDK - использует старый SDK из telegram-web-app.js
 * Документация: https://core.telegram.org/bots/webapps
 */

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            is_premium?: boolean;
            allows_write_to_pm?: boolean;
            photo_url?: string;
          };
          query_id?: string;
          auth_date?: number;
          hash?: string;
        };
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        onEvent: (eventType: string, callback: () => void) => void;
        offEvent: (eventType: string, callback: () => void) => void;
        sendData: (data: string) => void;
        switchInlineQuery: (query: string) => void;
        openLink: (url: string) => void;
        openTelegramLink: (url: string) => void;
        openInvoice: (url: string, callback?: (status: string) => void) => void;
        showPopup: (params: any, callback?: (buttonId: string) => void) => void;
        showAlert: (message: string, callback?: () => void) => void;
        showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive: boolean) => void;
          hideProgress: () => void;
          setParams: (params: any) => void;
        };
        SetupMainButton: (params: any) => void;
        SecondaryButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive: boolean) => void;
          hideProgress: () => void;
          setParams: (params: any) => void;
        };
        SetupSecondaryButton: (params: any) => void;
      };
    };
  }
}

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  allowsWriteToPm?: boolean;
  photoUrl?: string;
}

/**
 * Получить данные пользователя из Telegram
 */
export function getTelegramUser(): TelegramUser | null {
  try {
    if (!window.Telegram?.WebApp?.initDataUnsafe?.user) {
      console.log('[Telegram] No user data available');
      return null;
    }
    
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    console.log('[Telegram] User data:', user);
    
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      languageCode: user.language_code,
      isPremium: user.is_premium,
      allowsWriteToPm: user.allows_write_to_pm,
      photoUrl: user.photo_url,
    };
  } catch (error) {
    console.error('[Telegram] Error getting user:', error);
    return null;
  }
}

/**
 * Получить telegram_id текущего пользователя
 */
export function getTelegramId(): number | null {
  const user = getTelegramUser();
  return user?.id || null;
}

/**
 * Проверить что приложение открыто в Telegram
 */
export function isTelegramWebApp(): boolean {
  return !!window.Telegram?.WebApp?.initData;
}

/**
 * Инициализировать Telegram Web App
 */
export async function initTelegramWebApp(): Promise<void> {
  try {
    if (!isTelegramWebApp()) {
      console.log('[Telegram] Not running in Telegram Web App');
      document.documentElement.style.setProperty('--is-telegram', 'false');
      return;
    }

    console.log('[Telegram] Initializing Telegram Web App...');
    console.log('[Telegram] Version:', window.Telegram.WebApp.version);
    console.log('[Telegram] Platform:', window.Telegram.WebApp.platform);
    console.log('[Telegram] Color Scheme:', window.Telegram.WebApp.colorScheme);

    // Инициализация
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();

    // Настройка цветов (прямое присваивание)
    window.Telegram.WebApp.headerColor = 'bg_color';
    window.Telegram.WebApp.backgroundColor = 'bg_color';

    console.log('[Telegram] Telegram Web App initialized successfully');
  } catch (error) {
    console.error('[Telegram] Initialization error:', error);
  }
}

/**
 * Показать кнопку "Назад"
 */
export function showBackButton(onClick: () => void): void {
  if (!window.Telegram?.WebApp?.BackButton) return;
  
  window.Telegram.WebApp.BackButton.show();
  if (onClick) {
    window.Telegram.WebApp.BackButton.onClick(onClick);
  }
}

/**
 * Скрыть кнопку "Назад"
 */
export function hideBackButton(): void {
  if (!window.Telegram?.WebApp?.BackButton) return;
  window.Telegram.WebApp.BackButton.hide();
}

/**
 * Показать главную кнопку
 */
export function showMainButton(text: string, onClick: () => void): void {
  if (!window.Telegram?.WebApp?.MainButton) return;
  
  window.Telegram.WebApp.MainButton.text = text;
  window.Telegram.WebApp.MainButton.show();
  if (onClick) {
    window.Telegram.WebApp.MainButton.onClick(onClick);
  }
}

/**
 * Скрыть главную кнопку
 */
export function hideMainButton(): void {
  if (!window.Telegram?.WebApp?.MainButton) return;
  window.Telegram.WebApp.MainButton.hide();
}

/**
 * Гаптическая отдача при нажатии
 */
export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
  if (!window.Telegram?.WebApp?.HapticFeedback) return;
  window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
}

/**
 * Гаптическое уведомление
 */
export function hapticNotification(type: 'error' | 'success' | 'warning'): void {
  if (!window.Telegram?.WebApp?.HapticFeedback) return;
  window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
}

/**
 * Получить высоту вьюпорта
 */
export function getViewportHeight(): number {
  return window.Telegram?.WebApp?.viewportHeight || window.innerHeight;
}

/**
 * Получить стабильную высоту вьюпорта
 */
export function getViewportStableHeight(): number {
  return window.Telegram?.WebApp?.viewportStableHeight || window.innerHeight;
}

/**
 * Получить безопасные зоны (safe area)
 */
export function getSafeAreaInsets() {
  return {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
}

/**
 * Открыть ссылку в браузере
 */
export function openLink(url: string): void {
  if (!window.Telegram?.WebApp) return;
  window.Telegram.WebApp.openLink(url);
}

/**
 * Открыть Telegram ссылку
 */
export function openTelegramLink(url: string): void {
  if (!window.Telegram?.WebApp) return;
  window.Telegram.WebApp.openTelegramLink(url);
}

/**
 * Показать alert
 */
export function showAlert(message: string, callback?: () => void): void {
  if (!window.Telegram?.WebApp) return;
  window.Telegram.WebApp.showAlert(message, callback);
}

/**
 * Показать confirm диалог
 */
export function showConfirm(message: string, callback?: (confirmed: boolean) => void): void {
  if (!window.Telegram?.WebApp) return;
  window.Telegram.WebApp.showConfirm(message, callback);
}

/**
 * Закрыть Web App
 */
export function closeWebApp(): void {
  if (!window.Telegram?.WebApp) return;
  window.Telegram.WebApp.close();
}

/**
 * Получить параметры темы
 */
export function getThemeParams(): Record<string, string> {
  return window.Telegram?.WebApp?.themeParams || {};
}

/**
 * Получить цветовую схему
 */
export function getColorScheme(): 'light' | 'dark' {
  return window.Telegram?.WebApp?.colorScheme || 'light';
}

/**
 * Открыть в FULL режиме (полноэкранный)
 */
export function requestFullScreen(): void {
  try {
    // Сначала расширяем Telegram Web App
    if (window.Telegram?.WebApp?.expand) {
      window.Telegram.WebApp.expand();
    }

    // Затем запрашиваем полноэкранный режим через браузерный API
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if ((document.documentElement as any).webkitRequestFullscreen) {
      (document.documentElement as any).webkitRequestFullscreen();
    } else if ((document.documentElement as any).mozRequestFullScreen) {
      (document.documentElement as any).mozRequestFullScreen();
    } else if ((document.documentElement as any).msRequestFullscreen) {
      (document.documentElement as any).msRequestFullscreen();
    }

    console.log('[Telegram] Full screen mode requested');
  } catch (error) {
    console.error('[Telegram] Error requesting full screen:', error);
  }
}
