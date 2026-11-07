import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';

// GitHub Pages cannot set X-Frame-Options/frame-ancestors headers, so add a
// best-effort frame-buster on top of the meta CSP.
if (window.top !== window.self) {
  const message = document.createElement('p');
  message.textContent =
    'Aplikasi ini tidak dapat ditampilkan di dalam frame. Buka langsung di tab baru.';
  message.style.padding = '2rem';
  message.style.fontFamily = 'sans-serif';
  document.body.replaceChildren(message);
  throw new Error('Framed application blocked.');
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Elemen #app tidak ditemukan.');
}

const app = new App();
app.mount(root);

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    app.setUpdateAvailable(true, () => {
      void updateSW(true);
    });
  },
  onOfflineReady() {
    app.notify('Aplikasi siap digunakan secara offline.', 'info');
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    globalThis.setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  },
  onRegisterError(error) {
    console.error('Registrasi service worker gagal:', error);
  },
});
