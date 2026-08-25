import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTelegramWebApp } from './shared/telegram/telegram';

// 🔒 БЕЗОПАСНОСТЬ: Отключаем console.log, console.warn, console.info в продакшене
// console.error оставляем для отладки реальных ошибок
if (import.meta.env.PROD) {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
}

// Инициализируем Telegram WebApp перед рендером
initTelegramWebApp();

// FIX: Динамическая высота viewport для планшетов и мобильных устройств
// Это решает проблему с "отрыванием" подвала при скролле на планшетах
// когда адресная строка браузера скрывается/появляется
const setVh = () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
};

// Устанавливаем начальное значение
setVh();

// Обновляем при изменении размера viewport
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);

// Регистрируем Service Worker для PWA (только если поддерживается)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch((error) => {
        console.error('ServiceWorker registration failed: ', error);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <App />
);
