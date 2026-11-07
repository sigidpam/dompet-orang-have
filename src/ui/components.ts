import { html, nothing, type TemplateResult } from 'lit';
import { icon, type IconName } from './icons';

export function fieldError(
  id: string,
  message: string | undefined,
): TemplateResult | typeof nothing {
  if (!message) return nothing;
  return html`<p class="field-error" id=${id} role="alert">
    ${icon('alert', 'mt-0.5 size-3.5 shrink-0')}<span>${message}</span>
  </p>`;
}

export function errorSummary(
  errors: Record<string, string>,
  fieldIds: Record<string, string>,
): TemplateResult | typeof nothing {
  const entries = Object.entries(errors);
  if (entries.length === 0) return nothing;
  return html`<div
    class="mb-4 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
    role="alert"
    tabindex="-1"
    data-error-summary
  >
    <p class="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
      ${icon('alert', 'size-4')} Ada yang perlu diperbaiki
    </p>
    <ul class="mt-2 list-inside list-disc space-y-1">
      ${entries.map(([key, message]) =>
        fieldIds[key]
          ? html`<li>
              <a class="underline underline-offset-2" href=${`#${fieldIds[key]}`}
                >${message}</a
              >
            </li>`
          : html`<li>${message}</li>`,
      )}
    </ul>
  </div>`;
}

export function spinner(label = 'Memproses…'): TemplateResult {
  return html`<span class="inline-flex items-center gap-2" role="status">
    <span
      class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    ></span>
    <span class="sr-only">${label}</span>
  </span>`;
}

export function fieldLabel(
  forId: string,
  text: string,
  hint?: string,
): TemplateResult {
  return html`<label class="field-label" for=${forId}>${text}</label>
    ${hint ? html`<p class="field-hint mb-1.5" id=${`${forId}-hint`}>${hint}</p>` : nothing}`;
}

export function modalShell(options: {
  title: string;
  subtitle?: string;
  body: TemplateResult;
  footer?: TemplateResult;
  onClose?: () => void;
  closeDisabled?: boolean;
  wide?: boolean;
}): TemplateResult {
  const titleId = 'modal-title';
  return html`<div
    class="modal-backdrop"
    @click=${(event: MouseEvent) => {
      if (
        event.target === event.currentTarget &&
        options.onClose &&
        !options.closeDisabled
      ) {
        options.onClose();
      }
    }}
  >
    <section
      class=${`modal-panel scrollbar-thin ${options.wide ? 'sm:max-w-2xl' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby=${titleId}
      tabindex="-1"
    >
      <div class="mb-5 flex items-start justify-between gap-4 border-b border-line pb-3">
        <div>
          <h2
            class="font-mono text-sm uppercase tracking-[0.14em] text-ink"
            id=${titleId}
          >
            ${options.title}
          </h2>
          ${options.subtitle
            ? html`<p class="mt-1 text-xs leading-5 text-muted">
                ${options.subtitle}
              </p>`
            : nothing}
        </div>
        ${options.onClose
          ? html`<button
              type="button"
              class="btn-icon -mr-2 -mt-2 shrink-0"
              aria-label="Tutup dialog"
              ?disabled=${options.closeDisabled}
              @click=${options.onClose}
            >
              ${icon('x', 'size-5')}
            </button>`
          : nothing}
      </div>
      ${options.body}
      ${options.footer
        ? html`<div class="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            ${options.footer}
          </div>`
        : nothing}
    </section>
  </div>`;
}

export function emptyState(
  iconName: IconName,
  title: string,
  description: string,
  action?: TemplateResult,
): TemplateResult {
  return html`<div class="flex flex-col items-center px-4 py-10 text-center">
    <div
      class="mb-3 flex size-11 items-center justify-center border border-line bg-raised text-faint"
      aria-hidden="true"
    >
      ${icon(iconName, 'size-5')}
    </div>
    <p class="text-sm font-semibold text-ink">${title}</p>
    <p class="mt-1 max-w-sm text-xs leading-5 text-muted">${description}</p>
    ${action ? html`<div class="mt-4">${action}</div>` : nothing}
  </div>`;
}

export function kpiCard(options: {
  label: string;
  value: string;
  iconName: IconName;
  tone: 'income' | 'expense' | 'accent' | 'info' | 'neutral';
  detail?: string;
}): TemplateResult {
  const toneClass = {
    income: 'text-income',
    expense: 'text-expense',
    accent: 'text-accent',
    info: 'text-info',
    neutral: 'text-ink',
  }[options.tone];
  return html`<article class="card p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <p class="kpi-label">${options.label}</p>
      <span class=${`shrink-0 ${toneClass}`} aria-hidden="true"
        >${icon(options.iconName, 'size-4')}</span
      >
    </div>
    <p class=${`kpi-value ${toneClass}`}>${options.value}</p>
    ${options.detail
      ? html`<p class="mt-2 text-[11px] leading-4 text-faint">
          ${options.detail}
        </p>`
      : nothing}
  </article>`;
}

export function cardHeader(
  title: string,
  description?: string,
  action?: TemplateResult,
): TemplateResult {
  return html`<div
    class="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3"
  >
    <div>
      <h2 class="font-mono text-xs uppercase tracking-[0.14em] text-ink">
        ${title}
      </h2>
      ${description
        ? html`<p class="mt-1 text-xs leading-5 text-muted">${description}</p>`
        : nothing}
    </div>
    ${action ?? nothing}
  </div>`;
}

export function toastView(
  toast: { kind: 'success' | 'error' | 'info'; message: string } | null,
  onDismiss: () => void,
): TemplateResult {
  if (!toast) return html``;
  const tone =
    toast.kind === 'success'
      ? 'toast-success'
      : toast.kind === 'error'
        ? 'toast-error'
        : '';
  const iconName: IconName =
    toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info';
  return html`<div
    class=${`toast no-print ${tone}`}
    role=${toast.kind === 'error' ? 'alert' : 'status'}
    aria-live=${toast.kind === 'error' ? 'assertive' : 'polite'}
  >
    <span class="mt-0.5 shrink-0">${icon(iconName, 'size-4')}</span>
    <p class="flex-1 leading-5">${toast.message}</p>
    <button
      type="button"
      class="btn-icon -my-2 -mr-2 size-9"
      aria-label="Tutup notifikasi"
      @click=${onDismiss}
    >
      ${icon('x', 'size-4')}
    </button>
  </div>`;
}

export function serviceWorkerBadge(updateAvailable: boolean): TemplateResult {
  if (!updateAvailable) return html``;
  return html`<span class="badge border-accent/40 text-accent"
    >Update tersedia</span
  >`;
}
