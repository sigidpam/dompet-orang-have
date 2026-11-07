import { html, render, type TemplateResult } from 'lit';
import {
  VaultError,
  changePin,
  clearVault,
  createBackup,
  createVault,
  formatRecoveryCode,
  getRecoveryCode,
  hasVault,
  lockSession,
  lockoutRemainingMs as readLockoutRemainingMs,
  openBackup,
  unlockWithPin,
  unlockWithRecoveryCode,
  validatePin,
  type VaultSession,
} from './crypto/vault';
import { Repository } from './db/repository';
import { vaultStore } from './db/store';
import { downloadCsv } from './domain/csv';
import { formatIdr, todayIso, ValidationError } from './domain/money';
import { currenciesInUse, fetchRatesFromFrankfurter } from './domain/rates';
import { computeSummary, type Summary } from './domain/summary';
import type { Dataset } from './domain/types';
import {
  assertDataset,
  type AccountFormInput,
  type InvestmentFormInput,
  type TransactionFormInput,
} from './domain/validation';
import { toastView } from './ui/components';
import { renderDashboard } from './ui/dashboard';
import { renderBoot, renderLock, renderSetup } from './ui/lock';
import { renderModals } from './ui/modals';

export type Screen = 'boot' | 'setup' | 'locked' | 'unlocked';

export type ModalKind =
  | 'none'
  | 'account'
  | 'investment'
  | 'transaction'
  | 'settings'
  | 'change-pin'
  | 'recovery'
  | 'recovery-code'
  | 'reset'
  | 'backup-export'
  | 'backup-import'
  | 'delete-confirm';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  kind: ToastKind;
  message: string;
}

export interface ChangePinForm {
  oldPin: string;
  newPin: string;
  confirm: string;
  error: string;
}

export interface SettingsForm {
  autoLockMinutes: string;
  ratesAutoSync: boolean;
}

export type DeleteKind = 'transaction' | 'investment' | 'account' | 'rate';

export interface DeleteTarget {
  kind: DeleteKind;
  id: string;
  label: string;
}

export interface AppState {
  screen: Screen;
  bootError: string;
  busy: boolean;
  updateAvailable: boolean;
  offline: boolean;
  installAvailable: boolean;
  installHint: string;
  storagePersisted: boolean;
  modal: ModalKind;
  modalBusy: boolean;
  toast: ToastMessage | null;
  dataset: Dataset | null;
  summary: Summary | null;
  setupPin: string;
  setupPinConfirm: string;
  setupVisible: boolean;
  setupError: string;
  lockPin: string;
  lockPinVisible: boolean;
  lockError: string;
  lockoutUntil: number;
  recoveryCode: string;
  recoveryInput: string;
  recoveryError: string;
  recoveryAcknowledged: boolean;
  recoveredSession: boolean;
  changePin: ChangePinForm;
  accountForm: AccountFormInput;
  accountErrors: Record<string, string>;
  investmentForm: InvestmentFormInput;
  investmentErrors: Record<string, string>;
  transactionForm: TransactionFormInput;
  transactionErrors: Record<string, string>;
  settingsForm: SettingsForm;
  settingsError: string;
  rateForm: { currency: string; rate: string };
  rateError: string;
  backupPassphrase: string;
  backupPassphraseConfirm: string;
  backupError: string;
  importFile: File | null;
  importPassphrase: string;
  importError: string;
  resetConfirm: string;
  resetError: string;
  deleteTarget: DeleteTarget | null;
  deleteError: string;
}

function defaultAccountForm(): AccountFormInput {
  return { name: '', type: 'bank', currency: 'IDR', balance: '' };
}

function defaultInvestmentForm(): InvestmentFormInput {
  return {
    name: '',
    category: 'Deposito',
    principal: '',
    cashback: '',
    annualInterestRate: '',
    tenorMonths: '12',
    lots: '0',
    currency: 'IDR',
  };
}

function defaultTransactionForm(accountId = ''): TransactionFormInput {
  return {
    accountId,
    type: 'expense',
    category: '',
    amount: '',
    date: todayIso(),
  };
}

function defaultChangePin(): ChangePinForm {
  return { oldPin: '', newPin: '', confirm: '', error: '' };
}

function createInitialState(): AppState {
  return {
    screen: 'boot',
    bootError: '',
    busy: false,
    updateAvailable: false,
    offline: false,
    installAvailable: false,
    installHint: '',
    storagePersisted: false,
    modal: 'none',
    modalBusy: false,
    toast: null,
    dataset: null,
    summary: null,
    setupPin: '',
    setupPinConfirm: '',
    setupVisible: false,
    setupError: '',
    lockPin: '',
    lockPinVisible: false,
    lockError: '',
    lockoutUntil: 0,
    recoveryCode: '',
    recoveryInput: '',
    recoveryError: '',
    recoveryAcknowledged: false,
    recoveredSession: false,
    changePin: defaultChangePin(),
    accountForm: defaultAccountForm(),
    accountErrors: {},
    investmentForm: defaultInvestmentForm(),
    investmentErrors: {},
    transactionForm: defaultTransactionForm(),
    transactionErrors: {},
    settingsForm: { autoLockMinutes: '5', ratesAutoSync: false },
    settingsError: '',
    rateForm: { currency: 'USD', rate: '' },
    rateError: '',
    backupPassphrase: '',
    backupPassphraseConfirm: '',
    backupError: '',
    importFile: null,
    importPassphrase: '',
    importError: '',
    resetConfirm: '',
    resetError: '',
    deleteTarget: null,
    deleteError: '',
  };
}

function messageOf(error: unknown): string {
  if (
    error instanceof ValidationError ||
    error instanceof VaultError ||
    error instanceof Error
  ) {
    return error.message;
  }
  return 'Terjadi kesalahan. Coba lagi.';
}

export class App {
  readonly state: AppState = createInitialState();
  readonly version: string = __APP_VERSION__;

  private root: HTMLElement | null = null;
  private session: VaultSession | null = null;
  private repository: Repository | null = null;
  private lastActivity = Date.now();
  private hiddenAt: number | null = null;
  private pendingFocus: string | null = null;
  private modalTrigger: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private updateAction: (() => void) | null = null;
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private channel: BroadcastChannel | null = null;
  private persistenceRequested = false;

  mount(root: HTMLElement): void {
    this.root = root;
    this.attachListeners();
    void this.init();
  }

  private async init(): Promise<void> {
    this.state.offline = !navigator.onLine;
    this.detectInstallHint();
    try {
      if (!globalThis.crypto?.subtle) {
        throw new Error(
          'Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost pada browser modern.',
        );
      }
      if (hasVault()) {
        this.state.screen = 'locked';
        this.state.lockoutUntil =
          Date.now() + readLockoutRemainingMs();
        this.pendingFocus = '#unlock-pin';
      } else {
        this.state.screen = 'setup';
        this.pendingFocus = '#setup-pin';
      }
    } catch (error) {
      this.state.bootError = messageOf(error);
      this.state.screen = 'boot';
    }
    this.startTicker();
    this.openChannel();
    this.render();
  }

  private attachListeners(): void {
    window.addEventListener('online', () => {
      this.state.offline = false;
      this.render();
      void this.maybeAutoSyncRates();
    });
    window.addEventListener('offline', () => {
      this.state.offline = true;
      this.render();
    });
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPrompt = event as BeforeInstallPromptEvent;
      this.state.installAvailable = true;
      this.render();
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.state.installAvailable = false;
      this.state.installHint = '';
      this.notify('Aplikasi berhasil dipasang.', 'success');
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('pointerdown', () => {
      this.lastActivity = Date.now();
    });
  }

  private startTicker(): void {
    globalThis.setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    if (this.state.screen === 'locked') {
      const remaining = this.lockoutRemainingMs();
      const hadLockout = this.state.lockoutUntil > 0;
      this.state.lockoutUntil = remaining > 0 ? Date.now() + remaining : 0;
      if (remaining > 0 || hadLockout) {
        this.render();
      }
      return;
    }
    if (this.state.screen === 'unlocked' && this.session) {
      const minutes = this.state.dataset?.settings.autoLockMinutes ?? 5;
      if (Date.now() - this.lastActivity > minutes * 60_000) {
        this.lockNow();
      }
    }
  }

  private openChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel('dompet-orang-have');
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        typeof data !== 'object' ||
        data === null ||
        !('type' in data) ||
        typeof data.type !== 'string'
      ) {
        return;
      }
      if (data.type === 'lock' && this.state.screen === 'unlocked') {
        this.lockNow(false);
      } else if (data.type === 'reset') {
        this.applyRemoteReset();
      } else if (data.type === 'changed') {
        void this.reloadFromStore();
      }
    };
  }

  private broadcast(type: 'lock' | 'changed' | 'reset'): void {
    try {
      this.channel?.postMessage({ type });
    } catch {
      // Cross-tab sync is best-effort.
    }
  }

  private async reloadFromStore(): Promise<void> {
    if (
      this.state.screen !== 'unlocked' ||
      !this.session ||
      !this.repository ||
      this.state.modalBusy
    ) {
      return;
    }
    try {
      this.repository = await Repository.open(this.session);
      this.refreshData();
      this.render();
    } catch {
      // Keep the current view if another tab is mid-write.
    }
  }

  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      return;
    }
    if (this.state.screen === 'unlocked' && this.session) {
      const minutes = this.state.dataset?.settings.autoLockMinutes ?? 5;
      if (this.hiddenAt && Date.now() - this.hiddenAt > minutes * 60_000) {
        this.lockNow();
      }
      this.lastActivity = Date.now();
    }
    this.hiddenAt = null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.lastActivity = Date.now();
    if (this.state.modal === 'none') return;

    if (event.key === 'Escape') {
      if (this.state.modal !== 'recovery-code' && !this.state.modalBusy) {
        event.preventDefault();
        this.closeModal();
      }
      return;
    }

    if (event.key !== 'Tab') return;
    const panel = this.root?.querySelector<HTMLElement>('.modal-panel');
    if (!panel) return;
    const focusable = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private applyPendingFocus(): void {
    const selector = this.pendingFocus;
    if (!selector) return;
    this.pendingFocus = null;
    requestAnimationFrame(() => {
      const element = this.root?.querySelector<HTMLElement>(selector);
      if (!element) return;
      element.focus({ preventScroll: false });
      if (element instanceof HTMLInputElement && element.type !== 'checkbox') {
        element.select();
      }
    });
  }

  private render(): void {
    if (!this.root) return;
    let base: TemplateResult;
    if (this.state.screen === 'boot') {
      base = renderBoot(this);
    } else if (this.state.screen === 'setup') {
      base = renderSetup(this);
    } else if (this.state.screen === 'locked') {
      base = renderLock(this);
    } else {
      base = renderDashboard(this);
    }
    const modals =
      this.state.modal !== 'none' &&
      (this.state.screen === 'unlocked' || this.state.screen === 'locked')
        ? renderModals(this)
        : html``;
    render(
      html`${base}${modals}${toastView(this.state.toast, () =>
        this.dismissToast(),
      )}`,
      this.root,
    );
    this.applyPendingFocus();
  }

  private refreshData(): void {
    if (!this.repository) {
      this.state.dataset = null;
      this.state.summary = null;
      return;
    }
    const dataset = this.repository.snapshot();
    this.state.dataset = dataset;
    this.state.summary = computeSummary(dataset);
    this.state.offline = !navigator.onLine;
  }

  private async requestPersistence(): Promise<void> {
    if (this.persistenceRequested) return;
    this.persistenceRequested = true;
    try {
      const storage = navigator.storage;
      if (!storage) return;
      if (storage.persisted) {
        const already = await storage.persisted();
        if (already) {
          this.state.storagePersisted = true;
          return;
        }
      }
      if (storage.persist) {
        this.state.storagePersisted = await storage.persist();
      }
    } catch {
      // Persistence is an optimization; encryption is the real control.
    }
  }

  private detectInstallHint(): void {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) {
      this.state.installHint = '';
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      this.state.installHint =
        'Di iPhone/iPad: buka menu Bagikan di Safari, lalu pilih "Tambah ke Layar Utama".';
    }
  }

  private async maybeAutoSyncRates(): Promise<void> {
    if (
      this.state.screen !== 'unlocked' ||
      !this.repository ||
      !this.state.dataset?.settings.ratesAutoSync ||
      !navigator.onLine
    ) {
      return;
    }
    await this.syncRates(true);
  }

  private resetSensitiveState(): void {
    this.state.dataset = null;
    this.state.summary = null;
    this.state.toast = null;
    this.state.setupPin = '';
    this.state.setupPinConfirm = '';
    this.state.setupError = '';
    this.state.lockPin = '';
    this.state.lockError = '';
    this.state.lockoutUntil = 0;
    this.state.recoveryCode = '';
    this.state.recoveryInput = '';
    this.state.recoveryError = '';
    this.state.recoveryAcknowledged = false;
    this.state.recoveredSession = false;
    this.state.changePin = defaultChangePin();
    this.state.accountForm = defaultAccountForm();
    this.state.accountErrors = {};
    this.state.investmentForm = defaultInvestmentForm();
    this.state.investmentErrors = {};
    this.state.transactionForm = defaultTransactionForm();
    this.state.transactionErrors = {};
    this.state.settingsForm = { autoLockMinutes: '5', ratesAutoSync: false };
    this.state.settingsError = '';
    this.state.rateForm = { currency: 'USD', rate: '' };
    this.state.rateError = '';
    this.state.backupPassphrase = '';
    this.state.backupPassphraseConfirm = '';
    this.state.backupError = '';
    this.state.importFile = null;
    this.state.importPassphrase = '';
    this.state.importError = '';
    this.state.resetConfirm = '';
    this.state.resetError = '';
    this.state.deleteTarget = null;
    this.state.deleteError = '';
    this.state.modalBusy = false;
    this.modalTrigger = null;
  }

  private resetToSetup(message?: string): void {
    this.resetSensitiveState();
    this.state.screen = 'setup';
    this.state.modal = 'none';
    this.state.bootError = '';
    this.state.lockPinVisible = false;
    this.state.setupVisible = false;
    this.persistenceRequested = false;
    this.lastActivity = Date.now();
    this.pendingFocus = '#setup-pin';
    if (message) {
      this.notify(message, 'info');
    } else {
      this.render();
    }
  }

  private applyRemoteReset(): void {
    if (this.session) {
      lockSession(this.session);
    }
    this.session = null;
    this.repository = null;
    this.resetToSetup('Data lokal di tab lain telah dihapus.');
  }

  // --- PIN / vault -------------------------------------------------------

  onSetupPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '').slice(0, 12);
    input.value = cleaned;
    this.state.setupPin = cleaned;
  }

  onSetupConfirmInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '').slice(0, 12);
    input.value = cleaned;
    this.state.setupPinConfirm = cleaned;
  }

  toggleSetupVisible(): void {
    this.state.setupVisible = !this.state.setupVisible;
    this.render();
  }

  async submitSetup(): Promise<void> {
    if (this.state.busy) return;
    const pin = this.state.setupPin;
    const confirm = this.state.setupPinConfirm;
    if (!/^\d{6,12}$/.test(pin)) {
      this.state.setupError = 'PIN harus terdiri dari 6–12 digit angka.';
      this.pendingFocus = '#setup-pin';
      this.render();
      return;
    }
    if (pin !== confirm) {
      this.state.setupError = 'Konfirmasi PIN tidak cocok.';
      this.pendingFocus = '#setup-pin-confirm';
      this.render();
      return;
    }

    this.state.busy = true;
    this.state.setupError = '';
    this.render();
    let session: VaultSession | null = null;
    try {
      session = await createVault(pin);
      const repository = await Repository.open(session);
      this.session = session;
      this.repository = repository;
      this.state.screen = 'unlocked';
      this.state.modal = 'recovery-code';
      this.state.recoveryCode = formatRecoveryCode(getRecoveryCode(session));
      this.state.recoveryAcknowledged = false;
      this.state.setupPin = '';
      this.state.setupPinConfirm = '';
      this.refreshData();
      this.lastActivity = Date.now();
      void this.requestPersistence();
      this.broadcast('changed');
      this.pendingFocus = '.modal-panel';
    } catch (error) {
      if (session) {
        lockSession(session);
        clearVault();
        try {
          await vaultStore.clear();
        } catch {
          // Ignore cleanup failure; the error below is what matters.
        }
      }
      this.session = null;
      this.repository = null;
      this.state.setupError = messageOf(error);
      this.pendingFocus = '#setup-pin';
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  onLockPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '').slice(0, 12);
    input.value = cleaned;
    this.state.lockPin = cleaned;
  }

  toggleLockVisible(): void {
    this.state.lockPinVisible = !this.state.lockPinVisible;
    this.render();
  }

  lockoutRemainingMs(): number {
    return readLockoutRemainingMs();
  }

  async submitUnlock(): Promise<void> {
    if (this.state.busy) return;
    const remaining = this.lockoutRemainingMs();
    if (remaining > 0) {
      this.state.lockError = `Tunggu ${Math.ceil(remaining / 1000)} detik sebelum mencoba lagi.`;
      this.render();
      return;
    }
    if (!/^\d{6,12}$/.test(this.state.lockPin)) {
      this.state.lockError = 'PIN harus 6–12 digit angka.';
      this.pendingFocus = '#unlock-pin';
      this.render();
      return;
    }

    this.state.busy = true;
    this.state.lockError = '';
    this.render();
    let session: VaultSession | null = null;
    try {
      session = await unlockWithPin(this.state.lockPin);
      const repository = await Repository.open(session);
      this.session = session;
      this.repository = repository;
      this.state.screen = 'unlocked';
      this.state.modal = 'none';
      this.state.lockPin = '';
      this.state.lockError = '';
      this.refreshData();
      this.lastActivity = Date.now();
      void this.requestPersistence();
      this.pendingFocus = '#main';
      this.broadcast('changed');
      void this.maybeAutoSyncRates();
    } catch (error) {
      if (session) {
        lockSession(session);
      }
      this.session = null;
      this.repository = null;
      this.state.lockError =
        error instanceof VaultError && error.code === 'invalid-pin'
          ? 'PIN salah. Coba lagi.'
          : messageOf(error);
      this.state.lockoutUntil = Date.now() + this.lockoutRemainingMs();
      this.pendingFocus = '#unlock-pin';
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  lockNow(broadcastEvent = true): void {
    if (this.state.screen !== 'unlocked') return;
    if (this.session) {
      lockSession(this.session);
    }
    this.session = null;
    this.repository = null;
    this.resetSensitiveState();
    this.state.screen = 'locked';
    this.state.modal = 'none';
    this.state.lockoutUntil = Date.now() + readLockoutRemainingMs();
    this.lastActivity = 0;
    this.pendingFocus = '#unlock-pin';
    if (broadcastEvent) {
      this.broadcast('lock');
    }
    this.render();
  }

  // --- Modals ------------------------------------------------------------

  openModal(kind: ModalKind): void {
    if (this.state.screen !== 'unlocked') return;
    if (this.state.modal === 'none') {
      this.modalTrigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    if (kind === 'account') {
      this.state.accountForm = defaultAccountForm();
      this.state.accountErrors = {};
    } else if (kind === 'investment') {
      this.state.investmentForm = defaultInvestmentForm();
      this.state.investmentErrors = {};
    } else if (kind === 'transaction') {
      const firstAccount = this.state.dataset?.accounts[0];
      this.state.transactionForm = defaultTransactionForm(firstAccount?.id ?? '');
      this.state.transactionErrors = {};
    } else if (kind === 'settings') {
      this.state.settingsForm = {
        autoLockMinutes: String(
          this.state.dataset?.settings.autoLockMinutes ?? 5,
        ),
        ratesAutoSync: this.state.dataset?.settings.ratesAutoSync ?? false,
      };
      this.state.settingsError = '';
      const firstForeign = this.state.dataset?.rates[0]?.currency ?? 'USD';
      this.state.rateForm = { currency: firstForeign, rate: '' };
      this.state.rateError = '';
    } else if (kind === 'change-pin') {
      this.state.changePin = defaultChangePin();
    } else if (kind === 'backup-export') {
      this.state.backupPassphrase = '';
      this.state.backupPassphraseConfirm = '';
      this.state.backupError = '';
    } else if (kind === 'backup-import') {
      this.state.importFile = null;
      this.state.importPassphrase = '';
      this.state.importError = '';
    }
    this.state.modal = kind;
    this.state.modalBusy = false;
    this.pendingFocus = '[data-autofocus]';
    this.render();
  }

  openAddTransaction(): void {
    if (!this.state.dataset || this.state.dataset.accounts.length === 0) {
      this.notify('Tambahkan rekening terlebih dahulu.', 'info');
      this.openModal('account');
      return;
    }
    this.openModal('transaction');
  }

  openSettings(): void {
    this.openModal('settings');
  }

  openChangePin(): void {
    if (!this.session) return;
    this.openModal('change-pin');
  }

  openRecovery(): void {
    if (this.state.screen !== 'locked') return;
    if (this.state.modal === 'none') {
      this.modalTrigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    this.state.recoveryInput = '';
    this.state.recoveryError = '';
    this.state.modal = 'recovery';
    this.state.modalBusy = false;
    this.pendingFocus = '[data-autofocus]';
    this.render();
  }

  openReset(): void {
    if (this.state.screen !== 'locked' && this.state.screen !== 'unlocked') {
      return;
    }
    if (this.state.modal === 'none') {
      this.modalTrigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    this.state.resetConfirm = '';
    this.state.resetError = '';
    this.state.modal = 'reset';
    this.state.modalBusy = false;
    this.pendingFocus = '[data-autofocus]';
    this.render();
  }

  closeModal(): void {
    if (this.state.modal === 'recovery-code' || this.state.modalBusy) return;
    const trigger = this.modalTrigger;
    this.state.modal = 'none';
    this.state.deleteTarget = null;
    this.state.deleteError = '';
    this.modalTrigger = null;
    this.render();
    if (trigger?.isConnected) {
      requestAnimationFrame(() => trigger.focus());
    }
  }

  private finishModal(message: string): void {
    const trigger = this.modalTrigger;
    this.state.modal = 'none';
    this.state.modalBusy = false;
    this.state.deleteTarget = null;
    this.modalTrigger = null;
    this.refreshData();
    this.broadcast('changed');
    this.notify(message, 'success');
    if (trigger?.isConnected) {
      requestAnimationFrame(() => trigger.focus());
    }
  }

  private setFormError(
    kind: 'account' | 'investment' | 'transaction',
    error: unknown,
  ): void {
    const field = error instanceof ValidationError ? error.field : 'form';
    const bag =
      kind === 'account'
        ? this.state.accountErrors
        : kind === 'investment'
          ? this.state.investmentErrors
          : this.state.transactionErrors;
    bag[field] = messageOf(error);
    this.pendingFocus = '[data-error-summary]';
  }

  // --- Form setters ------------------------------------------------------

  setAccountField<K extends keyof AccountFormInput>(
    field: K,
    value: AccountFormInput[K],
  ): void {
    this.state.accountForm[field] = value;
    delete this.state.accountErrors[String(field)];
  }

  setInvestmentField<K extends keyof InvestmentFormInput>(
    field: K,
    value: InvestmentFormInput[K],
  ): void {
    this.state.investmentForm[field] = value;
    delete this.state.investmentErrors[String(field)];
  }

  setTransactionField<K extends keyof TransactionFormInput>(
    field: K,
    value: TransactionFormInput[K],
  ): void {
    this.state.transactionForm[field] = value;
    delete this.state.transactionErrors[String(field)];
  }

  setSettingsField(
    field: 'autoLockMinutes' | 'ratesAutoSync',
    value: string | boolean,
  ): void {
    if (field === 'autoLockMinutes' && typeof value === 'string') {
      this.state.settingsForm.autoLockMinutes = value;
    } else if (field === 'ratesAutoSync' && typeof value === 'boolean') {
      this.state.settingsForm.ratesAutoSync = value;
    }
    this.state.settingsError = '';
  }

  setChangePinField(
    field: 'oldPin' | 'newPin' | 'confirm',
    value: string,
  ): void {
    this.state.changePin[field] = value.replace(/\D/g, '').slice(0, 12);
    this.state.changePin.error = '';
  }

  setRateField(field: 'currency' | 'rate', value: string): void {
    this.state.rateForm[field] = value;
    this.state.rateError = '';
  }

  setBackupField(
    field:
      | 'backupPassphrase'
      | 'backupPassphraseConfirm'
      | 'importPassphrase',
    value: string,
  ): void {
    this.state[field] = value;
    if (field === 'importPassphrase') {
      this.state.importError = '';
    } else {
      this.state.backupError = '';
    }
  }

  setImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.state.importFile = input.files?.[0] ?? null;
    this.state.importError = '';
    this.render();
  }

  setResetConfirm(value: string): void {
    this.state.resetConfirm = value;
    this.state.resetError = '';
  }

  setRecoveryInput(value: string): void {
    this.state.recoveryInput = value;
    this.state.recoveryError = '';
  }

  setRecoveryAcknowledged(value: boolean): void {
    this.state.recoveryAcknowledged = value;
    this.render();
  }

  // --- Mutations ---------------------------------------------------------

  async submitAccount(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.accountErrors = {};
    this.render();
    try {
      await this.repository.addAccount(this.state.accountForm);
      this.finishModal('Rekening ditambahkan.');
    } catch (error) {
      this.setFormError('account', error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async submitInvestment(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.investmentErrors = {};
    this.render();
    try {
      await this.repository.addInvestment(this.state.investmentForm);
      this.finishModal('Investasi ditambahkan.');
    } catch (error) {
      this.setFormError('investment', error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async submitTransaction(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.transactionErrors = {};
    this.render();
    try {
      await this.repository.addTransaction(this.state.transactionForm);
      this.finishModal('Transaksi disimpan.');
    } catch (error) {
      this.setFormError('transaction', error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async saveSettings(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.settingsError = '';
    this.render();
    try {
      await this.repository.updateSettings({
        autoLockMinutes: this.state.settingsForm.autoLockMinutes,
        ratesAutoSync: this.state.settingsForm.ratesAutoSync,
      });
      this.refreshData();
      this.broadcast('changed');
      this.lastActivity = Date.now();
      this.notify('Pengaturan disimpan.', 'success');
      if (this.state.settingsForm.ratesAutoSync) {
        void this.syncRates(true);
      }
    } catch (error) {
      this.state.settingsError = messageOf(error);
      this.pendingFocus = '[data-error-summary]';
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async addRate(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.rateError = '';
    this.render();
    try {
      await this.repository.upsertRate(this.state.rateForm);
      this.state.rateForm.rate = '';
      this.refreshData();
      this.broadcast('changed');
      this.notify('Kurs disimpan.', 'success');
    } catch (error) {
      this.state.rateError = messageOf(error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async syncRates(silent = false): Promise<void> {
    if (!this.repository) return;
    if (!navigator.onLine) {
      if (!silent) {
        this.state.rateError = 'Tidak ada koneksi internet.';
        this.render();
      }
      return;
    }
    const current = this.repository.snapshot();
    const currencies = currenciesInUse(
      current.accounts.map((account) => account.currency),
      current.investments.map((investment) => investment.currency),
    );
    const targets =
      currencies.length > 0
        ? currencies
        : current.rates.map((rate) => rate.currency);
    if (targets.length === 0) {
      if (!silent) {
        this.state.rateError =
          'Belum ada mata uang non-IDR. Tambahkan rekening/investasi asing atau kurs manual.';
        this.render();
      }
      return;
    }

    if (!silent) {
      this.state.modalBusy = true;
      this.state.rateError = '';
      this.render();
    }
    try {
      const result = await fetchRatesFromFrankfurter(targets);
      const count = await this.repository.applyRates(result);
      this.refreshData();
      this.broadcast('changed');
      if (!silent) {
        this.notify(`${count} kurs diperbarui (${result.date}).`, 'success');
      }
    } catch (error) {
      if (!silent) {
        this.state.rateError = messageOf(error);
      }
    } finally {
      if (!silent) {
        this.state.modalBusy = false;
        this.render();
      }
    }
  }

  requestDelete(kind: DeleteKind, id: string, label: string): void {
    if (this.state.modal === 'none') {
      this.modalTrigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    this.state.deleteTarget = { kind, id, label };
    this.state.deleteError = '';
    this.state.modal = 'delete-confirm';
    this.state.modalBusy = false;
    this.pendingFocus = '[data-autofocus]';
    this.render();
  }

  async confirmDelete(): Promise<void> {
    const target = this.state.deleteTarget;
    if (!target || !this.repository || this.state.modalBusy) return;
    this.state.modalBusy = true;
    this.state.deleteError = '';
    this.render();
    try {
      if (target.kind === 'transaction') {
        await this.repository.deleteTransaction(target.id);
      } else if (target.kind === 'investment') {
        await this.repository.deleteInvestment(target.id);
      } else if (target.kind === 'account') {
        await this.repository.deleteAccount(target.id);
      } else {
        await this.repository.deleteRate(target.id);
      }
      this.finishModal('Data dihapus.');
    } catch (error) {
      this.state.deleteError = messageOf(error);
      this.pendingFocus = '[data-autofocus]';
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  // --- PIN change / recovery / reset ------------------------------------

  async submitChangePin(): Promise<void> {
    if (this.state.modalBusy || !this.session) return;
    const form = this.state.changePin;
    try {
      validatePin(form.newPin);
    } catch (error) {
      form.error = messageOf(error);
      this.pendingFocus = '#new-pin';
      this.render();
      return;
    }
    if (form.newPin !== form.confirm) {
      form.error = 'Konfirmasi PIN baru tidak cocok.';
      this.pendingFocus = '#confirm-pin';
      this.render();
      return;
    }

    this.state.modalBusy = true;
    form.error = '';
    this.render();
    try {
      if (!this.state.recoveredSession) {
        if (!/^\d{6,12}$/.test(form.oldPin)) {
          form.error = 'Masukkan PIN lama yang valid.';
          this.pendingFocus = '#old-pin';
          return;
        }
        let check: VaultSession | null = null;
        try {
          check = await unlockWithPin(form.oldPin);
        } catch {
          form.error = 'PIN lama salah.';
          this.pendingFocus = '#old-pin';
          return;
        } finally {
          if (check) lockSession(check);
        }
      }
      await changePin(this.session, form.newPin);
      this.state.recoveredSession = false;
      this.state.changePin = defaultChangePin();
      this.finishModal('PIN berhasil diubah.');
    } catch (error) {
      form.error = messageOf(error);
      this.pendingFocus = '[data-error-summary]';
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async submitRecovery(): Promise<void> {
    if (this.state.busy) return;
    const code = this.state.recoveryInput.trim();
    if (!code) {
      this.state.recoveryError = 'Masukkan kode pemulihan.';
      this.pendingFocus = '#recovery-input';
      this.render();
      return;
    }
    this.state.busy = true;
    this.state.recoveryError = '';
    this.render();
    let session: VaultSession | null = null;
    try {
      session = await unlockWithRecoveryCode(code);
      const repository = await Repository.open(session);
      this.session = session;
      this.repository = repository;
      this.state.screen = 'unlocked';
      this.state.modal = 'none';
      this.state.recoveryInput = '';
      this.state.recoveredSession = true;
      this.refreshData();
      this.lastActivity = Date.now();
      void this.requestPersistence();
      this.notify('Kode pemulihan diterima. Tetapkan PIN baru.', 'info');
      this.openModal('change-pin');
    } catch (error) {
      if (session) lockSession(session);
      this.session = null;
      this.repository = null;
      this.state.recoveryError = messageOf(error);
      this.pendingFocus = '#recovery-input';
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  async resetAll(): Promise<void> {
    if (this.state.modalBusy) return;
    if (this.state.resetConfirm.trim() !== 'HAPUS') {
      this.state.resetError = 'Ketik HAPUS untuk mengonfirmasi.';
      this.render();
      return;
    }
    this.state.modalBusy = true;
    this.state.resetError = '';
    this.render();
    try {
      clearVault();
      await vaultStore.clear();
      if (this.session) lockSession(this.session);
      this.session = null;
      this.repository = null;
      this.broadcast('reset');
      this.resetToSetup('Semua data lokal telah dihapus.');
    } catch (error) {
      this.state.resetError = messageOf(error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  finishRecoverySetup(): void {
    if (!this.state.recoveryAcknowledged) return;
    this.state.recoveryAcknowledged = false;
    this.state.recoveryCode = '';
    this.state.modal = 'none';
    this.lastActivity = Date.now();
    this.pendingFocus = '#main';
    this.notify('Vault siap. Data akan terkunci otomatis saat tidak aktif.', 'success');
  }

  async copyRecoveryCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        this.state.recoveryCode.replace(/\s/g, ''),
      );
      this.notify('Kode pemulihan disalin.', 'success');
    } catch {
      this.notify('Tidak dapat menyalin otomatis. Pilih kode secara manual.', 'error');
    }
  }

  downloadRecoveryCode(): void {
    const content = [
      'DOMPET ORANG HAVE — KODE PEMULIHAN',
      '',
      'Simpan secara offline. Kode ini memberi akses penuh ke data terenkripsi.',
      'Tanpa PIN atau kode ini, data tidak dapat dipulihkan.',
      '',
      this.state.recoveryCode,
      '',
      `Dibuat: ${new Date().toISOString()}`,
      '',
    ].join('\r\n');
    this.downloadFile(
      content,
      'dompet-kode-pemulihan.txt',
      'text/plain;charset=utf-8',
    );
    this.notify('Kode pemulihan diunduh.', 'success');
  }

  // --- Backup / export ---------------------------------------------------

  async exportBackup(): Promise<void> {
    if (!this.state.dataset || this.state.modalBusy) return;
    const pass = this.state.backupPassphrase.trim();
    if (pass.length < 8) {
      this.state.backupError = 'Frasa sandi minimal 8 karakter.';
      this.pendingFocus = '#backup-pass';
      this.render();
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- both values are client-side confirmation input, not a secret comparison
    if (pass !== this.state.backupPassphraseConfirm.trim()) {
      this.state.backupError = 'Konfirmasi frasa sandi tidak cocok.';
      this.pendingFocus = '#backup-pass';
      this.render();
      return;
    }
    this.state.modalBusy = true;
    this.state.backupError = '';
    this.render();
    try {
      const backup = await createBackup(this.state.dataset, pass);
      this.downloadFile(
        JSON.stringify(backup, null, 2),
        `dompet-backup-${todayIso()}.json`,
        'application/json;charset=utf-8',
      );
      this.state.backupPassphrase = '';
      this.state.backupPassphraseConfirm = '';
      this.finishModal('Backup terenkripsi diunduh.');
    } catch (error) {
      this.state.backupError = messageOf(error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  async importBackup(): Promise<void> {
    if (!this.repository || this.state.modalBusy) return;
    const file = this.state.importFile;
    if (!file) {
      this.state.importError = 'Pilih file backup terlebih dahulu.';
      this.render();
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.state.importError = 'File backup terlalu besar (maksimal 20 MB).';
      this.render();
      return;
    }
    if (!this.state.importPassphrase) {
      this.state.importError = 'Masukkan frasa sandi backup.';
      this.pendingFocus = '#import-pass';
      this.render();
      return;
    }
    this.state.modalBusy = true;
    this.state.importError = '';
    this.render();
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('File bukan JSON yang valid.');
      }
      const dataset = await openBackup(
        parsed,
        this.state.importPassphrase,
        assertDataset,
      );
      await this.repository.replaceDataset(dataset);
      this.state.importFile = null;
      this.state.importPassphrase = '';
      this.finishModal('Backup berhasil diimpor.');
    } catch (error) {
      this.state.importError = messageOf(error);
    } finally {
      this.state.modalBusy = false;
      this.render();
    }
  }

  exportCsv(): void {
    if (!this.state.dataset) return;
    downloadCsv(this.state.dataset);
    this.notify('CSV diunduh. File ini berisi teks biasa, bukan terenkripsi.', 'info');
  }

  printReport(): void {
    window.print();
  }

  async shareSummary(): Promise<void> {
    const summary = this.state.summary;
    if (!summary) return;
    const text = [
      'Ringkasan Keuangan & Investasi',
      `Dana liquid: ${formatIdr(summary.liquidCashIdr)}`,
      `Est. return investasi/bulan: ${formatIdr(summary.estMonthlyReturnIdr)}`,
      `Total pendapatan: ${formatIdr(summary.totalIncomeIdr)}`,
      `Total pengeluaran: ${formatIdr(summary.totalExpenseIdr)}`,
    ].join('\n');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Dompet Orang Have', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      this.notify('Ringkasan disalin ke clipboard.', 'success');
    } catch {
      this.notify('Berbagi dibatalkan atau tidak didukung.', 'info');
    }
  }

  private downloadFile(
    content: string,
    filename: string,
    type: string,
  ): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Install / update / notifications ---------------------------------

  async installApp(): Promise<void> {
    const prompt = this.installPrompt;
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      this.installPrompt = null;
      this.state.installAvailable = false;
      if (choice.outcome === 'accepted') {
        this.notify('Aplikasi dipasang.', 'success');
      }
    } catch {
      this.notify('Instalasi tidak tersedia di browser ini.', 'info');
    } finally {
      this.render();
    }
  }

  setUpdateAvailable(available: boolean, action?: () => void): void {
    this.state.updateAvailable = available;
    if (action) this.updateAction = action;
    this.render();
  }

  applyUpdate(): void {
    if (this.updateAction) {
      this.updateAction();
    } else {
      window.location.reload();
    }
  }

  notify(message: string, kind: ToastKind = 'info'): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.state.toast = { kind, message };
    this.render();
    this.toastTimer = setTimeout(() => {
      this.state.toast = null;
      this.toastTimer = null;
      this.render();
    }, 5000);
  }

  dismissToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.state.toast = null;
    this.render();
  }
}
