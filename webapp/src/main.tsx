import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Clipboard polyfill: navigator.clipboard 在非 secure context (http://) 上是 undefined.
// 全部 navigator.clipboard.writeText(...) 调用会爆 "Cannot read properties of undefined".
// 用 document.execCommand('copy') 兜底, 调用方不必改.
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  (navigator as any).clipboard = {
    writeText(text: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error('execCommand copy returned false'));
        } catch (e) {
          reject(e);
        }
      });
    },
    readText(): Promise<string> {
      return Promise.reject(new Error('clipboard.readText not supported in non-secure context'));
    },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
