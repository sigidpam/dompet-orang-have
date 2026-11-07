import { html, nothing, type TemplateResult } from 'lit';
import type { App } from '../app';
import {
  CURATED_CURRENCIES,
  FUND_CATEGORY,
  GOLD_CATEGORY,
  INVESTMENT_CATEGORIES,
  RETURN_CATEGORIES,
  STOCK_CATEGORY,
  TENOR_CATEGORIES,
  type InvestmentCategory,
} from '../domain/types';
import { formatDateTime, formatIdr, formatRate } from '../domain/money';
import { icon } from './icons';
import { errorSummary, fieldError, modalShell } from './components';

const ACCOUNT_FIELD_IDS: Record<string, string> = {
  name: 'acc-name',
  type: 'acc-type',
  currency: 'acc-currency',
  balance: 'acc-balance',
};

const INVESTMENT_FIELD_IDS: Record<string, string> = {
  name: 'inv-name',
  category: 'inv-category',
  principal: 'inv-principal',
  cashback: 'inv-cashback',
  annualInterestRate: 'inv-rate',
  tenorMonths: 'inv-tenor',
  lots: 'inv-lots',
  currency: 'inv-currency',
  units: 'inv-units',
  nab: 'inv-nab',
  nib: 'inv-nib',
  stockCurrentPrice: 'inv-stock-price',
  goldGrams: 'inv-gold-grams',
  goldBuyPricePerGram: 'inv-gold-buy',
  goldCurrentPricePerGram: 'inv-gold-current',
};

const TRANSACTION_FIELD_IDS: Record<string, string> = {
  accountId: 'tx-account',
  type: 'tx-type',
  category: 'tx-category',
  amount: 'tx-amount',
  date: 'tx-date',
};

function currencyList(app: App): string[] {
  const dataset = app.state.dataset;
  const used = dataset
    ? [
        ...dataset.accounts.map((account) => account.currency),
        ...dataset.investments.map((investment) => investment.currency),
        ...dataset.rates.map((rate) => rate.currency),
      ]
    : [];
  return [...new Set([...CURATED_CURRENCIES, ...used])].sort((a, b) =>
    a === 'IDR' ? -1 : b === 'IDR' ? 1 : a.localeCompare(b),
  );
}

function currencyDatalist(app: App): TemplateResult {
  return html`<datalist id="currency-options">
    ${currencyList(app).map((currency) => html`<option value=${currency}></option>`)}
  </datalist>`;
}

function closeButton(app: App, label = 'Batal'): TemplateResult {
  return html`<button
    type="button"
    class="btn"
    ?disabled=${app.state.modalBusy}
    @click=${() => app.closeModal()}
  >
    ${label}
  </button>`;
}

function accountModal(app: App): TemplateResult {
  const form = app.state.accountForm;
  const errors = app.state.accountErrors;
  return modalShell({
    title: 'Tambah rekening',
    subtitle: 'Saldo awal disimpan lokal dan terenkripsi.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="account-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.submitAccount();
      }}
    >
      ${errorSummary(errors, ACCOUNT_FIELD_IDS)}
      <div>
        <label class="field-label" for="acc-name">Nama rekening</label>
        <input
          id="acc-name"
          class="field-input"
          type="text"
          maxlength="80"
          autocomplete="off"
          placeholder="BCA, Dompet, GoPay…"
          .value=${form.name}
          data-autofocus
          aria-invalid=${errors.name ? 'true' : 'false'}
          aria-describedby=${errors.name ? 'acc-name-error' : nothing}
          @input=${(event: Event) =>
            app.setAccountField(
              'name',
              (event.target as HTMLInputElement).value,
            )}
        />
        ${fieldError('acc-name-error', errors.name)}
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="acc-type">Tipe</label>
          <select
            id="acc-type"
            class="field-input"
            .value=${form.type}
            aria-invalid=${errors.type ? 'true' : 'false'}
            aria-describedby=${errors.type ? 'acc-type-error' : nothing}
            @change=${(event: Event) =>
              app.setAccountField(
                'type',
                (event.target as HTMLSelectElement).value,
              )}
          >
            <option value="bank">Bank</option>
            <option value="cash">Tunai</option>
            <option value="e_wallet">E-Wallet</option>
          </select>
          ${fieldError('acc-type-error', errors.type)}
        </div>
        <div>
          <label class="field-label" for="acc-currency">Mata uang</label>
          <input
            id="acc-currency"
            class="field-input font-mono uppercase"
            type="text"
            maxlength="3"
            list="currency-options"
            autocomplete="off"
            autocapitalize="characters"
            placeholder="IDR"
            .value=${form.currency}
            aria-invalid=${errors.currency ? 'true' : 'false'}
            aria-describedby=${errors.currency ? 'acc-currency-error' : nothing}
            @input=${(event: Event) =>
              app.setAccountField(
                'currency',
                (event.target as HTMLInputElement).value,
              )}
          />
          ${fieldError('acc-currency-error', errors.currency)}
        </div>
      </div>
      <div>
        <label class="field-label" for="acc-balance">Saldo awal</label>
        <input
          id="acc-balance"
          class="field-input font-mono tabular"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0"
          .value=${form.balance}
          aria-invalid=${errors.balance ? 'true' : 'false'}
          aria-describedby="acc-balance-hint${errors.balance ? ' acc-balance-error' : ''}"
          @input=${(event: Event) =>
            app.setAccountField(
              'balance',
              (event.target as HTMLInputElement).value,
            )}
        />
        ${fieldError('acc-balance-error', errors.balance)}
        <p class="field-hint" id="acc-balance-hint">
          Tanpa pemisah ribuan. Gunakan koma atau titik untuk desimal.
        </p>
      </div>
      ${currencyDatalist(app)}
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="account-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Menyimpan…' : 'Simpan rekening'}
      </button>`,
  });
}

function investmentModal(app: App): TemplateResult {
  const form = app.state.investmentForm;
  const errors = app.state.investmentErrors;
  const editing = app.state.editingInvestmentId !== null;
  const category = form.category as InvestmentCategory;
  const isStock = category === STOCK_CATEGORY;
  const isFund = category === FUND_CATEGORY;
  const isGold = category === GOLD_CATEGORY;
  const hasTenor = TENOR_CATEGORIES.includes(category);
  const hasReturn = RETURN_CATEGORIES.includes(category);
  const categoryOptions: string[] = [...INVESTMENT_CATEGORIES];
  if (!categoryOptions.includes(form.category)) {
    categoryOptions.unshift(form.category);
  }
  const market = app.state.goldPrice;

  return modalShell({
    title: editing ? 'Ubah investasi' : 'Tambah investasi',
    subtitle: editing
      ? 'Perbarui nilai investasi, harga saat ini, atau NIB/NAB agar portofolio akurat.'
      : 'Pilih kategori; isian menyesuaikan jenis aset.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    wide: true,
    body: html`<form
      id="investment-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.submitInvestment();
      }}
    >
      ${errorSummary(errors, INVESTMENT_FIELD_IDS)}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_1.4fr]">
        <div>
          <label class="field-label" for="inv-category">Kategori</label>
          <select
            id="inv-category"
            class="field-input"
            .value=${form.category}
            aria-invalid=${errors.category ? 'true' : 'false'}
            aria-describedby=${errors.category ? 'inv-category-error' : nothing}
            @change=${(event: Event) =>
              app.setInvestmentCategory(
                (event.target as HTMLSelectElement).value,
              )}
          >
            ${categoryOptions.map(
              (option) => html`<option value=${option}>${option}</option>`,
            )}
          </select>
          ${fieldError('inv-category-error', errors.category)}
        </div>
        <div>
          <label class="field-label" for="inv-name">Nama aset</label>
          <input
            id="inv-name"
            class="field-input"
            type="text"
            maxlength="80"
            placeholder="BBCA, SBN Ritel, Reksa Dana Pasar Uang…"
            .value=${form.name}
            data-autofocus
            aria-invalid=${errors.name ? 'true' : 'false'}
            aria-describedby=${errors.name ? 'inv-name-error' : nothing}
            @input=${(event: Event) =>
              app.setInvestmentField(
                'name',
                (event.target as HTMLInputElement).value,
              )}
          />
          ${fieldError('inv-name-error', errors.name)}
        </div>
      </div>

      ${isGold
        ? html`<div class="border border-accent/30 bg-accent/5 p-3 text-xs leading-5 text-muted">
            Nilai investasi dihitung otomatis dari <strong class="text-ink">harga beli × gramasi</strong>.
            Harga acuan saat ini:
            <strong class="text-accent">${market ? formatIdr(market.pricePerGram) + '/gram' : 'belum tersedia'}</strong>.
          </div>`
        : html`<div>
            <label class="field-label" for="inv-principal">Nilai Investasi</label>
            <input
              id="inv-principal"
              class="field-input font-mono tabular"
              type="text"
              inputmode="decimal"
              placeholder="0"
              .value=${form.principal}
              aria-invalid=${errors.principal ? 'true' : 'false'}
              aria-describedby="inv-principal-hint${errors.principal ? ' inv-principal-error' : ''}"
              @input=${(event: Event) =>
                app.setInvestmentField(
                  'principal',
                  (event.target as HTMLInputElement).value,
                )}
            />
            ${fieldError('inv-principal-error', errors.principal)}
            <p class="field-hint" id="inv-principal-hint">
              Nilai yang Anda tanamkan, bukan nilai saat ini.
            </p>
          </div>`}

      ${isStock
        ? html`<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="field-label" for="inv-lots">Jumlah lot</label>
              <input
                id="inv-lots"
                class="field-input font-mono tabular"
                type="text"
                inputmode="numeric"
                placeholder="0"
                .value=${form.lots}
                aria-invalid=${errors.lots ? 'true' : 'false'}
                aria-describedby="inv-lots-hint${errors.lots ? ' inv-lots-error' : ''}"
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'lots',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-lots-error', errors.lots)}
              <p class="field-hint" id="inv-lots-hint">
                1 lot = 100 lembar. Nilai saat ini = lot × 100 × harga per lembar.
              </p>
            </div>
            <div>
              <label class="field-label" for="inv-stock-price">
                Harga saat ini / lembar
              </label>
              <input
                id="inv-stock-price"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.stockCurrentPrice}
                aria-invalid=${errors.stockCurrentPrice ? 'true' : 'false'}
                aria-describedby=${errors.stockCurrentPrice ? 'inv-stock-price-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'stockCurrentPrice',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-stock-price-error', errors.stockCurrentPrice)}
              <p class="field-hint">Opsional; kosongkan untuk memakai nilai investasi.</p>
            </div>
          </div>`
        : nothing}

      ${isFund
        ? html`<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="field-label" for="inv-nib">NIB (nilai bersih)</label>
              <input
                id="inv-nib"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.nib}
                aria-invalid=${errors.nib ? 'true' : 'false'}
                aria-describedby=${errors.nib ? 'inv-nib-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'nib',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-nib-error', errors.nib)}
            </div>
            <div>
              <label class="field-label" for="inv-nab">NAB / unit</label>
              <input
                id="inv-nab"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.nab}
                aria-invalid=${errors.nab ? 'true' : 'false'}
                aria-describedby=${errors.nab ? 'inv-nab-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'nab',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-nab-error', errors.nab)}
            </div>
            <div>
              <label class="field-label" for="inv-units">Unit</label>
              <input
                id="inv-units"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.units}
                aria-invalid=${errors.units ? 'true' : 'false'}
                aria-describedby=${errors.units ? 'inv-units-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'units',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-units-error', errors.units)}
            </div>
          </div>
          <p class="field-hint">
            NIB = nilai investasi bersih dalam mata uang aset; NAB = nilai aktiva
            bersih per unit. Isi NAB dan Unit bersama untuk menghitung nilai saat
            ini; NIB dipakai lebih dulu jika diisi.
          </p>`
        : nothing}

      ${isGold
        ? html`<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="field-label" for="inv-gold-buy">Harga beli / gram</label>
              <input
                id="inv-gold-buy"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.goldBuyPricePerGram}
                aria-invalid=${errors.goldBuyPricePerGram ? 'true' : 'false'}
                aria-describedby=${errors.goldBuyPricePerGram ? 'inv-gold-buy-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'goldBuyPricePerGram',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-gold-buy-error', errors.goldBuyPricePerGram)}
            </div>
            <div>
              <label class="field-label" for="inv-gold-grams">Gramasi</label>
              <input
                id="inv-gold-grams"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.goldGrams}
                aria-invalid=${errors.goldGrams ? 'true' : 'false'}
                aria-describedby=${errors.goldGrams ? 'inv-gold-grams-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'goldGrams',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-gold-grams-error', errors.goldGrams)}
            </div>
            <div>
              <label class="field-label" for="inv-gold-current">
                Harga saat ini / gram
              </label>
              <input
                id="inv-gold-current"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="Opsional"
                .value=${form.goldCurrentPricePerGram}
                aria-invalid=${errors.goldCurrentPricePerGram ? 'true' : 'false'}
                aria-describedby=${errors.goldCurrentPricePerGram ? 'inv-gold-current-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'goldCurrentPricePerGram',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-gold-current-error', errors.goldCurrentPricePerGram)}
              <p class="field-hint">Kosongkan untuk memakai harga acuan.</p>
            </div>
          </div>`
        : nothing}

      ${hasReturn
        ? html`<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            ${hasTenor
              ? html`<div>
                  <label class="field-label" for="inv-tenor">Tenor (bulan)</label>
                  <input
                    id="inv-tenor"
                    class="field-input font-mono tabular"
                    type="text"
                    inputmode="numeric"
                    placeholder="12"
                    .value=${form.tenorMonths}
                    aria-invalid=${errors.tenorMonths ? 'true' : 'false'}
                    aria-describedby=${errors.tenorMonths ? 'inv-tenor-error' : nothing}
                    @input=${(event: Event) =>
                      app.setInvestmentField(
                        'tenorMonths',
                        (event.target as HTMLInputElement).value,
                      )}
                  />
                  ${fieldError('inv-tenor-error', errors.tenorMonths)}
                </div>`
              : nothing}
            <div>
              <label class="field-label" for="inv-rate">Bunga % p.a.</label>
              <input
                id="inv-rate"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="6"
                .value=${form.annualInterestRate}
                aria-invalid=${errors.annualInterestRate ? 'true' : 'false'}
                aria-describedby=${errors.annualInterestRate ? 'inv-rate-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'annualInterestRate',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-rate-error', errors.annualInterestRate)}
            </div>
            <div>
              <label class="field-label" for="inv-cashback">Cashback</label>
              <input
                id="inv-cashback"
                class="field-input font-mono tabular"
                type="text"
                inputmode="decimal"
                placeholder="0"
                .value=${form.cashback}
                aria-invalid=${errors.cashback ? 'true' : 'false'}
                aria-describedby=${errors.cashback ? 'inv-cashback-error' : nothing}
                @input=${(event: Event) =>
                  app.setInvestmentField(
                    'cashback',
                    (event.target as HTMLInputElement).value,
                  )}
              />
              ${fieldError('inv-cashback-error', errors.cashback)}
            </div>
          </div>`
        : nothing}

      <div>
        <label class="field-label" for="inv-currency">Mata uang</label>
        <input
          id="inv-currency"
          class="field-input font-mono uppercase"
          type="text"
          maxlength="3"
          list="currency-options"
          autocomplete="off"
          autocapitalize="characters"
          placeholder="IDR"
          .value=${form.currency}
          aria-invalid=${errors.currency ? 'true' : 'false'}
          aria-describedby=${errors.currency ? 'inv-currency-error' : nothing}
          @input=${(event: Event) =>
            app.setInvestmentField(
              'currency',
              (event.target as HTMLInputElement).value,
            )}
        />
        ${fieldError('inv-currency-error', errors.currency)}
      </div>
      ${currencyDatalist(app)}
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="investment-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy
          ? 'Menyimpan…'
          : editing
            ? 'Simpan perubahan'
            : 'Tambah investasi'}
      </button>`,
  });
}

function transactionModal(app: App): TemplateResult {
  const dataset = app.state.dataset;
  const form = app.state.transactionForm;
  const errors = app.state.transactionErrors;
  if (!dataset || dataset.accounts.length === 0) {
    return modalShell({
      title: 'Tambah transaksi',
      onClose: () => app.closeModal(),
      body: html`<div class="space-y-4 text-sm leading-6 text-muted">
        <p>
          Anda perlu rekening terlebih dahulu. Transaksi akan otomatis
          memperbarui saldo rekening terkait.
        </p>
        <button
          type="button"
          class="btn btn-primary w-full"
          @click=${() => app.openModal('account')}
        >
          ${icon('plus', 'size-4')} Tambah rekening dulu
        </button>
      </div>`,
      footer: closeButton(app),
    });
  }
  return modalShell({
    title: 'Tambah transaksi',
    subtitle: 'Saldo rekening diperbarui otomatis sesuai jenis transaksi.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="transaction-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.submitTransaction();
      }}
    >
      ${errorSummary(errors, TRANSACTION_FIELD_IDS)}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="tx-type">Jenis</label>
          <select
            id="tx-type"
            class="field-input"
            .value=${form.type}
            @change=${(event: Event) =>
              app.setTransactionField(
                'type',
                (event.target as HTMLSelectElement).value,
              )}
          >
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="tx-account">Rekening</label>
          <select
            id="tx-account"
            class="field-input"
            .value=${form.accountId}
            aria-invalid=${errors.accountId ? 'true' : 'false'}
            aria-describedby=${errors.accountId ? 'tx-account-error' : nothing}
            @change=${(event: Event) =>
              app.setTransactionField(
                'accountId',
                (event.target as HTMLSelectElement).value,
              )}
          >
            ${dataset.accounts.map(
              (account) => html`<option value=${account.id}>
                ${account.name} (${account.currency})
              </option>`,
            )}
          </select>
          ${fieldError('tx-account-error', errors.accountId)}
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="field-label" for="tx-category">Kategori</label>
          <input
            id="tx-category"
            class="field-input"
            type="text"
            maxlength="60"
            list="transaction-categories"
            placeholder="Makan, Gaji, Transport…"
            .value=${form.category}
            data-autofocus
            aria-invalid=${errors.category ? 'true' : 'false'}
            aria-describedby=${errors.category ? 'tx-category-error' : nothing}
            @input=${(event: Event) =>
              app.setTransactionField(
                'category',
                (event.target as HTMLInputElement).value,
              )}
          />
          <datalist id="transaction-categories">
            ${[
              'Gaji',
              'Bonus',
              'Makan',
              'Transport',
              'Tagihan',
              'Belanja',
              'Hiburan',
              'Kesehatan',
              'Pendidikan',
              'Investasi',
              'Lainnya',
            ].map((category) => html`<option value=${category}></option>`)}
          </datalist>
          ${fieldError('tx-category-error', errors.category)}
        </div>
        <div>
          <label class="field-label" for="tx-amount">Jumlah</label>
          <input
            id="tx-amount"
            class="field-input font-mono tabular"
            type="text"
            inputmode="decimal"
            placeholder="0"
            .value=${form.amount}
            aria-invalid=${errors.amount ? 'true' : 'false'}
            aria-describedby=${errors.amount ? 'tx-amount-error' : nothing}
            @input=${(event: Event) =>
              app.setTransactionField(
                'amount',
                (event.target as HTMLInputElement).value,
              )}
          />
          ${fieldError('tx-amount-error', errors.amount)}
        </div>
      </div>
      <div>
        <label class="field-label" for="tx-date">Tanggal</label>
        <input
          id="tx-date"
          class="field-input font-mono"
          type="date"
          min="1970-01-01"
          max="2100-12-31"
          .value=${form.date}
          aria-invalid=${errors.date ? 'true' : 'false'}
          aria-describedby=${errors.date ? 'tx-date-error' : nothing}
          @input=${(event: Event) =>
            app.setTransactionField(
              'date',
              (event.target as HTMLInputElement).value,
            )}
        />
        ${fieldError('tx-date-error', errors.date)}
      </div>
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="transaction-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Menyimpan…' : 'Simpan transaksi'}
      </button>`,
  });
}

function changePinModal(app: App): TemplateResult {
  const form = app.state.changePin;
  return modalShell({
    title: 'Ubah PIN',
    subtitle: 'Data tetap memakai kunci yang sama; hanya pembungkus PIN yang diperbarui.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="change-pin-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.submitChangePin();
      }}
    >
      ${app.state.recoveredSession
        ? html`<div class="border border-accent/40 bg-accent/10 p-3 text-sm leading-5 text-accent">
            Anda masuk memakai kode pemulihan. Tetapkan PIN baru sekarang.
          </div>`
        : html`<div>
            <label class="field-label" for="old-pin">PIN lama</label>
            <input
              id="old-pin"
              class="field-input font-mono tracking-[0.3em]"
              type="password"
              inputmode="numeric"
              maxlength="12"
              autocomplete="current-password"
              .value=${form.oldPin}
              data-autofocus
              @input=${(event: Event) =>
                app.setChangePinField(
                  'oldPin',
                  (event.target as HTMLInputElement).value,
                )}
            />
          </div>`}
      <div>
        <label class="field-label" for="new-pin">PIN baru (6–12 digit)</label>
        <input
          id="new-pin"
          class="field-input font-mono tracking-[0.3em]"
          type="password"
          inputmode="numeric"
          maxlength="12"
          autocomplete="new-password"
          .value=${form.newPin}
          @input=${(event: Event) =>
            app.setChangePinField(
              'newPin',
              (event.target as HTMLInputElement).value,
            )}
        />
      </div>
      <div>
        <label class="field-label" for="confirm-pin">Ulangi PIN baru</label>
        <input
          id="confirm-pin"
          class="field-input font-mono tracking-[0.3em]"
          type="password"
          inputmode="numeric"
          maxlength="12"
          autocomplete="new-password"
          .value=${form.confirm}
          @input=${(event: Event) =>
            app.setChangePinField(
              'confirm',
              (event.target as HTMLInputElement).value,
            )}
        />
      </div>
      ${form.error
        ? html`<p class="border border-danger/40 bg-danger/10 p-3 text-sm leading-5 text-danger" role="alert">
            ${form.error}
          </p>`
        : nothing}
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="change-pin-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Menyimpan…' : 'Simpan PIN baru'}
      </button>`,
  });
}

function recoveryModal(app: App): TemplateResult {
  return modalShell({
    title: 'Kode pemulihan',
    subtitle: 'Masukkan kode 256-bit yang Anda simpan saat membuat vault.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="recovery-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.submitRecovery();
      }}
    >
      <div class="border border-accent/40 bg-accent/10 p-3 text-xs leading-5 text-accent">
        Kode pemulihan memberikan akses penuh ke data. Jangan bagikan atau
        menempelkannya ke situs lain.
      </div>
      <div>
        <label class="field-label" for="recovery-input">Kode pemulihan</label>
        <textarea
          id="recovery-input"
          class="field-input min-h-24 font-mono text-sm"
          rows="3"
          spellcheck="false"
          autocomplete="off"
          placeholder="xxxxxx xxxxxx xxxxxx…"
          .value=${app.state.recoveryInput}
          data-autofocus
          @input=${(event: Event) =>
            app.setRecoveryInput((event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </div>
      ${app.state.recoveryError
        ? html`<p class="border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">
            ${app.state.recoveryError}
          </p>`
        : nothing}
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="recovery-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Memverifikasi…' : 'Buka dengan kode'}
      </button>`,
  });
}

function recoveryCodeModal(app: App): TemplateResult {
  return modalShell({
    title: 'Simpan kode pemulihan',
    subtitle: 'Kode ini hanya ditampilkan sekali. Tanpa PIN atau kode ini, data tidak dapat dibuka.',
    closeDisabled: true,
    body: html`<div class="space-y-4">
      <div class="border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">
        <p class="font-semibold">Penting</p>
        <p class="mt-1">
          Kode pemulihan adalah kunci mentah 256-bit. Siapa pun yang memilikinya
          bisa membuka seluruh data Anda. Simpan offline di tempat aman—bukan di
          catatan yang tersinkron ke cloud.
        </p>
      </div>
      <div>
        <p class="field-label">Kode pemulihan</p>
        <code
          class="block select-all break-all border border-line bg-canvas p-3 font-mono text-sm leading-6 text-accent"
          data-recovery-code
          >${app.state.recoveryCode}</code
        >
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn" @click=${() => void app.copyRecoveryCode()}>
          ${icon('copy', 'size-4')} Salin
        </button>
        <button type="button" class="btn" @click=${() => app.downloadRecoveryCode()}>
          ${icon('download', 'size-4')} Unduh .txt
        </button>
      </div>
      <label class="flex items-start gap-3 border border-line bg-raised p-3 text-sm leading-5 text-muted">
        <input
          type="checkbox"
          class="mt-1 size-4 accent-amber-400"
          .checked=${app.state.recoveryAcknowledged}
          @change=${(event: Event) =>
            app.setRecoveryAcknowledged(
              (event.target as HTMLInputElement).checked,
            )}
        />
        <span>
          Saya sudah menyimpan kode ini di tempat aman dan memahami bahwa data
          tidak bisa dipulihkan tanpa PIN atau kode ini.
        </span>
      </label>
    </div>`,
    footer: html`<button
      type="button"
      class="btn btn-primary w-full sm:w-auto"
      ?disabled=${!app.state.recoveryAcknowledged}
      @click=${() => app.finishRecoverySetup()}
    >
      ${icon('check', 'size-4')} Lanjut ke dashboard
    </button>`,
  });
}

function resetModal(app: App): TemplateResult {
  return modalShell({
    title: 'Hapus semua data lokal',
    subtitle: 'Tindakan ini tidak dapat dibatalkan.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<div class="space-y-4">
      <div class="border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger">
        Vault, seluruh rekening, transaksi, investasi, dan kurs akan dihapus dari
        perangkat ini. Backup yang sudah Anda unduh tidak terpengaruh.
      </div>
      <div>
        <label class="field-label" for="reset-confirm">
          Ketik HAPUS untuk mengonfirmasi
        </label>
        <input
          id="reset-confirm"
          class="field-input font-mono uppercase"
          type="text"
          autocomplete="off"
          placeholder="HAPUS"
          .value=${app.state.resetConfirm}
          data-autofocus
          @input=${(event: Event) =>
            app.setResetConfirm((event.target as HTMLInputElement).value)}
        />
      </div>
      ${app.state.resetError
        ? html`<p class="text-sm text-danger" role="alert">${app.state.resetError}</p>`
        : nothing}
    </div>`,
    footer: html`${closeButton(app)}
      <button
        type="button"
        class="btn btn-danger"
        ?disabled=${app.state.modalBusy || app.state.resetConfirm.trim().toUpperCase() !== 'HAPUS'}
        @click=${() => void app.resetAll()}
      >
        ${app.state.modalBusy ? 'Menghapus…' : 'Hapus permanen'}
      </button>`,
  });
}

function backupExportModal(app: App): TemplateResult {
  return modalShell({
    title: 'Backup terenkripsi',
    subtitle: 'File backup dienkripsi dengan frasa sandi terpisah dari PIN.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="backup-export-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.exportBackup();
      }}
    >
      <div>
        <label class="field-label" for="backup-pass">Frasa sandi (min. 8 karakter)</label>
        <input
          id="backup-pass"
          class="field-input"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="256"
          .value=${app.state.backupPassphrase}
          data-autofocus
          @input=${(event: Event) =>
            app.setBackupField(
              'backupPassphrase',
              (event.target as HTMLInputElement).value,
            )}
        />
      </div>
      <div>
        <label class="field-label" for="backup-pass-confirm">Ulangi frasa sandi</label>
        <input
          id="backup-pass-confirm"
          class="field-input"
          type="password"
          autocomplete="new-password"
          maxlength="256"
          .value=${app.state.backupPassphraseConfirm}
          @input=${(event: Event) =>
            app.setBackupField(
              'backupPassphraseConfirm',
              (event.target as HTMLInputElement).value,
            )}
        />
      </div>
      ${app.state.backupError
        ? html`<p class="border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">
            ${app.state.backupError}
          </p>`
        : nothing}
      <p class="field-hint">
        Tanpa frasa sandi ini, file backup tidak bisa dibuka. Simpan di tempat
        aman dan terpisah dari perangkat.
      </p>
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="backup-export-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Membuat…' : 'Unduh backup'}
      </button>`,
  });
}

function backupImportModal(app: App): TemplateResult {
  return modalShell({
    title: 'Impor backup',
    subtitle: 'Semua data saat ini akan diganti oleh isi backup.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<form
      id="backup-import-form"
      class="space-y-4"
      @submit=${(event: Event) => {
        event.preventDefault();
        void app.importBackup();
      }}
    >
      <div class="border border-danger/40 bg-danger/10 p-3 text-sm leading-5 text-danger">
        Buat backup data saat ini terlebih dahulu jika Anda ingin bisa kembali.
      </div>
      <div>
        <label class="field-label" for="import-file">File backup (.json)</label>
        <input
          id="import-file"
          class="field-input"
          type="file"
          accept="application/json,.json"
          @change=${(event: Event) => app.setImportFile(event)}
        />
        ${app.state.importFile
          ? html`<p class="field-hint">
              ${app.state.importFile.name} ·
              ${Math.ceil(app.state.importFile.size / 1024)} KB
            </p>`
          : nothing}
      </div>
      <div>
        <label class="field-label" for="import-pass">Frasa sandi backup</label>
        <input
          id="import-pass"
          class="field-input"
          type="password"
          autocomplete="off"
          maxlength="256"
          .value=${app.state.importPassphrase}
          data-autofocus
          @input=${(event: Event) =>
            app.setBackupField(
              'importPassphrase',
              (event.target as HTMLInputElement).value,
            )}
        />
      </div>
      ${app.state.importError
        ? html`<p class="border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">
            ${app.state.importError}
          </p>`
        : nothing}
    </form>`,
    footer: html`${closeButton(app)}
      <button
        type="submit"
        form="backup-import-form"
        class="btn btn-primary"
        ?disabled=${app.state.modalBusy}
      >
        ${app.state.modalBusy ? 'Mengimpor…' : 'Impor & ganti data'}
      </button>`,
  });
}

function settingsModal(app: App): TemplateResult {
  const dataset = app.state.dataset;
  if (!dataset) return html``;
  const form = app.state.settingsForm;
  return modalShell({
    title: 'Pengaturan',
    subtitle: 'Keamanan, kurs, backup, dan aplikasi.',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    wide: true,
    body: html`<div class="space-y-6">
      <section aria-labelledby="settings-security">
        <h3 id="settings-security" class="font-mono text-xs uppercase tracking-wider text-accent">
          Keamanan
        </h3>
        <form
          class="mt-3 space-y-3"
          @submit=${(event: Event) => {
            event.preventDefault();
            void app.saveSettings();
          }}
        >
          <div>
            <label class="field-label" for="auto-lock">Kunci otomatis</label>
            <select
              id="auto-lock"
              class="field-input"
              .value=${form.autoLockMinutes}
              @change=${(event: Event) =>
                app.setSettingsField(
                  'autoLockMinutes',
                  (event.target as HTMLSelectElement).value,
                )}
            >
              <option value="1">Setelah 1 menit tidak aktif</option>
              <option value="5">Setelah 5 menit tidak aktif</option>
              <option value="15">Setelah 15 menit tidak aktif</option>
              <option value="30">Setelah 30 menit tidak aktif</option>
            </select>
          </div>
          <label class="flex items-start gap-3 text-sm leading-5 text-muted">
            <input
              type="checkbox"
              class="mt-1 size-4 accent-amber-400"
              .checked=${form.ratesAutoSync}
              @change=${(event: Event) =>
                app.setSettingsField(
                  'ratesAutoSync',
                  (event.target as HTMLInputElement).checked,
                )}
            />
            <span>
              Perbarui kurs otomatis saat membuka vault (opsional, hanya kode mata
              uang yang dikirim ke penyedia kurs).
            </span>
          </label>
          ${app.state.settingsError
            ? html`<p class="text-sm text-danger" role="alert">${app.state.settingsError}</p>`
            : nothing}
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="btn" ?disabled=${app.state.modalBusy}>
              Simpan pengaturan
            </button>
            <button type="button" class="btn" @click=${() => app.openChangePin()}>
              ${icon('key', 'size-4')} Ubah PIN
            </button>
            <button type="button" class="btn" @click=${() => app.lockNow()}>
              ${icon('lock', 'size-4')} Kunci sekarang
            </button>
          </div>
        </form>
      </section>

      <section class="border-t border-line pt-4" aria-labelledby="settings-rates">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="settings-rates" class="font-mono text-xs uppercase tracking-wider text-accent">
            Kurs ke IDR
          </h3>
          <button
            type="button"
            class="btn"
            ?disabled=${app.state.modalBusy || app.state.offline}
            @click=${() => void app.syncRates()}
          >
            ${icon('refresh', 'size-4')} ${app.state.modalBusy ? 'Memuat…' : 'Ambil kurs'}
          </button>
        </div>
        <p class="mt-2 text-xs leading-5 text-muted">
          Kurs manual dipakai untuk konversi total IDR. Sinkronisasi memakai
          referensi ECB melalui <span class="font-mono">api.frankfurter.dev</span>;
          hanya kode mata uang yang dikirim, bukan data keuangan.
        </p>
        ${dataset.rates.length === 0
          ? html`<p class="mt-3 border border-line bg-raised p-3 text-xs text-muted">
              Belum ada kurs. Total IDR hanya mencakup rekening IDR.
            </p>`
          : html`<ul class="mt-3 divide-y divide-line border border-line">
              ${dataset.rates.map(
                (rate) => html`<li class="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p class="font-mono text-sm text-ink">
                      1 ${rate.currency} = ${formatRate(rate.rateToIdr)} IDR
                    </p>
                    <p class="text-[10px] text-faint">
                      ${rate.source === 'manual' ? 'Manual' : 'Frankfurter'} ·
                      ${formatDateTime(rate.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn-icon text-faint hover:text-danger"
                    aria-label=${`Hapus kurs ${rate.currency}`}
                    @click=${() =>
                      app.requestDelete('rate', rate.currency, `kurs ${rate.currency}`)}
                  >
                    ${icon('trash', 'size-4')}
                  </button>
                </li>`,
              )}
            </ul>`}
        <form
          class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
          @submit=${(event: Event) => {
            event.preventDefault();
            void app.addRate();
          }}
        >
          <div>
            <label class="field-label" for="rate-currency">Mata uang</label>
            <input
              id="rate-currency"
              class="field-input font-mono uppercase"
              type="text"
              list="currency-options"
              maxlength="3"
              autocomplete="off"
              autocapitalize="characters"
              placeholder="USD"
              .value=${app.state.rateForm.currency}
              @input=${(event: Event) =>
                app.setRateField(
                  'currency',
                  (event.target as HTMLInputElement).value,
                )}
            />
          </div>
          <div>
            <label class="field-label" for="rate-value">Kurs ke IDR</label>
            <input
              id="rate-value"
              class="field-input font-mono tabular"
              type="text"
              inputmode="decimal"
              placeholder="16000"
              .value=${app.state.rateForm.rate}
              @input=${(event: Event) =>
                app.setRateField(
                  'rate',
                  (event.target as HTMLInputElement).value,
                )}
            />
          </div>
          <div class="flex items-end">
            <button type="submit" class="btn w-full sm:w-auto">
              ${icon('plus', 'size-4')} Simpan kurs
            </button>
          </div>
        </form>
        ${app.state.rateError
          ? html`<p class="mt-2 text-sm text-danger" role="alert">${app.state.rateError}</p>`
          : nothing}
        ${currencyDatalist(app)}
      </section>

      <section class="border-t border-line pt-4" aria-labelledby="settings-gold">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="settings-gold" class="font-mono text-xs uppercase tracking-wider text-accent">
            Harga emas acuan
          </h3>
          <button
            type="button"
            class="btn"
            ?disabled=${app.state.goldPriceLoading}
            @click=${() => void app.loadGoldPrice(true)}
          >
            ${icon('refresh', 'size-4')}
            ${app.state.goldPriceLoading ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>
        ${app.state.goldPrice
          ? html`<p class="mt-2 font-mono text-lg font-bold tabular text-ink">
              ${formatIdr(app.state.goldPrice.pricePerGram)}<span class="ml-1 text-xs font-normal text-muted">/gram</span>
            </p>
            <p class="mt-1 text-[10px] leading-4 text-faint">
              ${app.state.goldPrice.source} ·
              ${formatDateTime(app.state.goldPrice.updatedAt)}
              ${app.state.goldPrice.sourceType === 'spot' ? ' · harga spot, bukan retail ANTAM' : ''}
            </p>`
          : html`<p class="mt-2 text-xs leading-5 text-muted">
              ${app.state.goldPriceError || 'Belum tersedia. Perbarui saat online.'}
            </p>`}
        <p class="mt-2 text-xs leading-5 text-faint">
          Dipakai untuk aset emas yang tidak mengisi harga manual. Harga manual
          per aset selalu menimpa harga acuan. Sumber: gold-api XAU/USD × kurs
          USD/IDR, diperbarui oleh workflow harian.
        </p>
      </section>

      <section class="border-t border-line pt-4" aria-labelledby="settings-data">
        <h3 id="settings-data" class="font-mono text-xs uppercase tracking-wider text-accent">
          Data &amp; laporan
        </h3>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn" @click=${() => app.openModal('backup-export')}>
            ${icon('download', 'size-4')} Backup terenkripsi
          </button>
          <button type="button" class="btn" @click=${() => app.openModal('backup-import')}>
            ${icon('file', 'size-4')} Impor backup
          </button>
          <button type="button" class="btn" @click=${() => app.exportCsv()}>
            ${icon('download', 'size-4')} CSV
          </button>
          <button type="button" class="btn" @click=${() => app.printReport()}>
            ${icon('printer', 'size-4')} Cetak / PDF
          </button>
          <button type="button" class="btn" @click=${() => void app.shareSummary()}>
            ${icon('share', 'size-4')} Bagikan ringkasan
          </button>
        </div>
        <p class="mt-2 text-xs leading-5 text-faint">
          CSV berisi data keuangan dalam teks biasa. Backup JSON dienkripsi
          AES-256-GCM dengan frasa sandi terpisah.
        </p>
        <p class="mt-2 text-xs text-faint">
          Penyimpanan persisten:
          <span class="text-ink">${app.state.storagePersisted ? 'aktif' : 'belum dikonfirmasi'}</span>.
        </p>
      </section>

      <section class="border-t border-line pt-4" aria-labelledby="settings-app">
        <h3 id="settings-app" class="font-mono text-xs uppercase tracking-wider text-accent">
          Aplikasi
        </h3>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          ${app.state.installAvailable
            ? html`<button type="button" class="btn btn-primary" @click=${() => void app.installApp()}>
                ${icon('install', 'size-4')} Instal aplikasi
              </button>`
            : nothing}
          ${app.state.updateAvailable
            ? html`<button type="button" class="btn" @click=${() => app.applyUpdate()}>
                ${icon('refresh', 'size-4')} Muat versi baru
              </button>`
            : nothing}
          <span class="badge">v${app.version}</span>
          <span class="badge">${app.state.offline ? 'Offline' : 'Daring'}</span>
        </div>
        ${app.state.installHint
          ? html`<p class="mt-2 text-xs leading-5 text-muted">${app.state.installHint}</p>`
          : nothing}
        <p class="mt-2 text-xs leading-5 text-faint">
          Aplikasi berjalan sepenuhnya di browser. Pembaruan dikirim lewat service
          worker dan hanya memuat ulang aset aplikasi—data terenkripsi tidak diubah.
        </p>
      </section>

      <section class="border-t border-danger/30 pt-4" aria-labelledby="settings-danger">
        <h3 id="settings-danger" class="font-mono text-xs uppercase tracking-wider text-danger">
          Zona berbahaya
        </h3>
        <p class="mt-2 text-xs leading-5 text-muted">
          Hapus vault dan seluruh data dari perangkat ini. Pastikan backup sudah
          dibuat.
        </p>
        <button type="button" class="btn btn-danger mt-3" @click=${() => app.openReset()}>
          ${icon('trash', 'size-4')} Hapus semua data
        </button>
      </section>
    </div>`,
  });
}

function deleteConfirmModal(app: App): TemplateResult {
  const target = app.state.deleteTarget;
  if (!target) return html``;
  return modalShell({
    title: 'Konfirmasi hapus',
    onClose: () => app.closeModal(),
    closeDisabled: app.state.modalBusy,
    body: html`<div class="space-y-3 text-sm leading-6 text-muted">
      <p>
        Hapus <strong class="text-ink">${target.label}</strong
        >? Tindakan ini tidak dapat dibatalkan.
      </p>
      ${target.kind === 'transaction'
        ? html`<p class="text-xs text-accent">
            Saldo rekening terkait akan dikoreksi otomatis.
          </p>`
        : nothing}
      ${app.state.deleteError
        ? html`<p class="text-sm text-danger" role="alert">${app.state.deleteError}</p>`
        : nothing}
    </div>`,
    footer: html`${closeButton(app)}
      <button
        type="button"
        class="btn btn-danger"
        ?disabled=${app.state.modalBusy}
        data-autofocus
        @click=${() => void app.confirmDelete()}
      >
        ${app.state.modalBusy ? 'Menghapus…' : 'Hapus'}
      </button>`,
  });
}

export function renderModals(app: App): TemplateResult {
  switch (app.state.modal) {
    case 'none':
      return html``;
    case 'account':
      return accountModal(app);
    case 'investment':
      return investmentModal(app);
    case 'transaction':
      return transactionModal(app);
    case 'settings':
      return settingsModal(app);
    case 'change-pin':
      return changePinModal(app);
    case 'recovery':
      return recoveryModal(app);
    case 'recovery-code':
      return recoveryCodeModal(app);
    case 'reset':
      return resetModal(app);
    case 'backup-export':
      return backupExportModal(app);
    case 'backup-import':
      return backupImportModal(app);
    case 'delete-confirm':
      return deleteConfirmModal(app);
    default:
      return html``;
  }
}
