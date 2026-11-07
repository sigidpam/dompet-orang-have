import { html, type TemplateResult } from 'lit';
import type { App } from '../app';
import { icon } from './icons';

function lockoutSeconds(app: App): number {
  return Math.ceil(app.lockoutRemainingMs() / 1000);
}

function brandLockup(): TemplateResult {
  return html`<div class="flex items-center gap-3">
    <span
      class="flex size-10 items-center justify-center border border-accent/40 bg-accent/10 text-accent"
      aria-hidden="true"
      >${icon('shield', 'size-5')}</span
    >
    <div>
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        Dompet Orang Have
      </p>
      <p class="text-sm font-semibold text-ink">Wealth &amp; Cashflow</p>
    </div>
  </div>`;
}

function passwordToggle(
  visible: boolean,
  onToggle: () => void,
): TemplateResult {
  return html`<button
    type="button"
    class="btn-icon absolute right-0 top-0 size-11"
    aria-label=${visible ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
    aria-pressed=${visible}
    @click=${onToggle}
  >
    ${icon(visible ? 'eyeOff' : 'eye', 'size-4')}
  </button>`;
}

export function renderBoot(app: App): TemplateResult {
  return html`<main
    class="app-shell flex min-h-dvh flex-col items-center justify-center gap-4 text-center"
  >
    <span class="text-accent" aria-hidden="true">${icon('shield', 'size-10')}</span>
    <p class="font-mono text-xs uppercase tracking-[0.2em] text-muted">
      Membuka vault lokal
    </p>
    <div class="h-0.5 w-40 overflow-hidden bg-line" aria-hidden="true">
      <div class="h-full w-1/2 animate-pulse bg-accent"></div>
    </div>
    ${app.state.bootError
      ? html`<p class="mt-4 max-w-md border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
          ${app.state.bootError}
        </p>`
      : html`<span class="sr-only" role="status">Memuat aplikasi</span>`}
  </main>`;
}

export function renderSetup(app: App): TemplateResult {
  const { setupPin, setupPinConfirm, setupVisible, setupError } = app.state;
  return html`<main class="app-shell flex min-h-dvh items-center justify-center py-8">
    <div class="w-full max-w-md">
      ${brandLockup()}
      <section class="card mt-6 p-5 sm:p-6">
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          Langkah 1 dari 2
        </p>
        <h1 class="mt-2 text-balance text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Buat PIN untuk mengenkripsi data Anda
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Seluruh data keuangan disimpan di perangkat ini dan dienkripsi dengan
          AES-256-GCM. PIN tidak pernah disimpan—hanya digunakan untuk menurunkan
          kunci enkripsi.
        </p>

        ${setupError
          ? html`<div
              class="mt-4 border border-danger/40 bg-danger/10 p-3 text-sm leading-5 text-danger"
              role="alert"
            >
              ${setupError}
            </div>`
          : null}

        <form class="mt-5 space-y-4" @submit=${(event: Event) => {
          event.preventDefault();
          void app.submitSetup();
        }}>
          <div>
            <label class="field-label" for="setup-pin">PIN baru (6–12 digit)</label>
            <div class="relative">
              <input
                id="setup-pin"
                class="field-input pr-12 font-mono text-lg tracking-[0.3em]"
                type=${setupVisible ? 'text' : 'password'}
                inputmode="numeric"
                autocomplete="new-password"
                maxlength="12"
                pattern="[0-9]*"
                .value=${setupPin}
                data-autofocus
                aria-describedby="setup-pin-hint"
                @input=${(event: Event) => app.onSetupPinInput(event)}
              />
              ${passwordToggle(setupVisible, () => app.toggleSetupVisible())}
            </div>
            <p class="field-hint" id="setup-pin-hint">
              Gunakan 6 digit atau lebih. Hindari tanggal lahir dan angka berurutan.
            </p>
          </div>

          <div>
            <label class="field-label" for="setup-pin-confirm">Ulangi PIN</label>
            <div class="relative">
              <input
                id="setup-pin-confirm"
                class="field-input pr-12 font-mono text-lg tracking-[0.3em]"
                type=${setupVisible ? 'text' : 'password'}
                inputmode="numeric"
                autocomplete="new-password"
                maxlength="12"
                pattern="[0-9]*"
                .value=${setupPinConfirm}
                aria-describedby="setup-pin-confirm-hint"
                @input=${(event: Event) => app.onSetupConfirmInput(event)}
              />
            </div>
            <p class="field-hint" id="setup-pin-confirm-hint">
              Harus sama dengan PIN di atas.
            </p>
          </div>

          <div class="border border-accent/30 bg-accent/5 p-3 text-xs leading-5 text-muted">
            <p class="flex items-start gap-2">
              <span class="mt-0.5 text-accent">${icon('key', 'size-4')}</span>
              <span>
                Setelah vault dibuat, Anda akan menerima <strong class="text-ink">kode pemulihan</strong>.
                Simpan kode itu di tempat aman. Tanpa PIN atau kode pemulihan, data
                tidak dapat dibuka kembali—tidak ada server yang bisa meresetnya.
              </span>
            </p>
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full"
            ?disabled=${app.state.busy}
          >
            ${app.state.busy ? 'Membuat vault…' : 'Buat vault terenkripsi'}
            ${app.state.busy ? '' : icon('arrowRight', 'size-4')}
          </button>
        </form>
      </section>

      <details class="mt-4 border border-line bg-surface/60 p-4 text-xs leading-5 text-muted">
        <summary class="cursor-pointer font-mono uppercase tracking-wider text-faint">
          Bagaimana keamanannya bekerja?
        </summary>
        <ul class="mt-3 list-inside list-disc space-y-2">
          <li>PIN 6–12 digit diturunkan menjadi kunci dengan PBKDF2-SHA-256 (600.000 iterasi).</li>
          <li>Data dienkripsi AES-256-GCM sebelum masuk IndexedDB; PIN tidak disimpan.</li>
          <li>Vault terkunci otomatis saat tidak aktif. Tidak ada analytics atau pengiriman data.</li>
          <li>Kode pemulihan adalah kunci mentah 256-bit; siapa pun yang memilikinya bisa membuka data.</li>
        </ul>
      </details>

      <button
        type="button"
        class="btn btn-ghost mt-3 w-full text-danger hover:text-danger"
        @click=${() => app.openReset()}
      >
        Data lama tidak bisa dibuka? Hapus data lokal
      </button>

      <p class="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        Lokal-first · Tanpa server · v${app.version}
      </p>
    </div>
  </main>`;
}

export function renderLock(app: App): TemplateResult {
  const remaining = lockoutSeconds(app);
  const lockedOut = remaining > 0;
  return html`<main class="app-shell flex min-h-dvh items-center justify-center py-8">
    <div class="w-full max-w-md">
      ${brandLockup()}
      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          ${icon('lock', 'size-3.5')} Vault terkunci
        </div>
        <h1 class="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Masukkan PIN untuk membuka
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Data Anda terenkripsi di perangkat ini. PIN tidak dikirim ke mana pun.
        </p>

        ${app.state.lockError
          ? html`<div
              class="mt-4 border border-danger/40 bg-danger/10 p-3 text-sm leading-5 text-danger"
              role="alert"
            >
              ${app.state.lockError}
            </div>`
          : null}
        ${lockedOut
          ? html`<div
              class="mt-4 border border-accent/40 bg-accent/10 p-3 text-sm leading-5 text-accent"
              role="status"
              aria-live="polite"
            >
              Terlalu banyak percobaan. Coba lagi dalam ${remaining} detik.
            </div>`
          : null}

        <form class="mt-5 space-y-4" @submit=${(event: Event) => {
          event.preventDefault();
          void app.submitUnlock();
        }}>
          <div>
            <label class="field-label" for="unlock-pin">PIN</label>
            <div class="relative">
              <input
                id="unlock-pin"
                class="field-input pr-12 text-center font-mono text-xl tracking-[0.4em]"
                type=${app.state.lockPinVisible ? 'text' : 'password'}
                inputmode="numeric"
                autocomplete="current-password"
                maxlength="12"
                pattern="[0-9]*"
                .value=${app.state.lockPin}
                data-autofocus
                ?disabled=${lockedOut || app.state.busy}
                aria-describedby="unlock-hint"
                @input=${(event: Event) => app.onLockPinInput(event)}
              />
              ${passwordToggle(app.state.lockPinVisible, () =>
                app.toggleLockVisible(),
              )}
            </div>
            <p class="field-hint" id="unlock-hint">
              PIN 6–12 digit. Tempel (paste) diizinkan jika Anda memakai pengelola kata sandi.
            </p>
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full"
            ?disabled=${lockedOut || app.state.busy}
          >
            ${app.state.busy ? 'Membuka…' : 'Buka vault'}
            ${app.state.busy ? '' : icon('unlock', 'size-4')}
          </button>
        </form>

        <div class="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-center text-xs">
          <button
            type="button"
            class="btn btn-ghost w-full"
            @click=${() => app.openRecovery()}
          >
            ${icon('key', 'size-4')} Gunakan kode pemulihan
          </button>
          <button
            type="button"
            class="btn btn-ghost w-full text-danger hover:text-danger"
            @click=${() => app.openReset()}
          >
            Lupa PIN? Hapus data lokal
          </button>
        </div>
      </section>

      <p class="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        AES-256-GCM · PBKDF2 600k · v${app.version}
      </p>
    </div>
  </main>`;
}
