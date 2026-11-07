import { html, type TemplateResult } from 'lit';

export type IconName =
  | 'shield'
  | 'lock'
  | 'unlock'
  | 'key'
  | 'plus'
  | 'settings'
  | 'download'
  | 'printer'
  | 'share'
  | 'wallet'
  | 'bank'
  | 'cash'
  | 'trendUp'
  | 'trendDown'
  | 'trash'
  | 'x'
  | 'check'
  | 'alert'
  | 'refresh'
  | 'install'
  | 'wifiOff'
  | 'chart'
  | 'eye'
  | 'eyeOff'
  | 'copy'
  | 'file'
  | 'arrowRight'
  | 'info'
  | 'clock'
  | 'logout';

const paths: Record<IconName, TemplateResult> = {
  shield: html`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />`,
  lock: html`<rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
  unlock: html`<rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />`,
  key: html`<circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" />`,
  plus: html`<path d="M5 12h14M12 5v14" />`,
  settings: html`<path d="M20 7h-9M14 17H5" />
    <circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />`,
  download: html`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" /><path d="M12 15V3" />`,
  printer: html`<path d="M6 9V2h12v7" />
    <path
      d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
    />
    <path d="M6 14h12v8H6z" />`,
  share: html`<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="m16 6-4-4-4 4" /><path d="M12 2v13" />`,
  wallet: html`<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />`,
  bank: html`<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 7H3Z" />`,
  cash: html`<rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" />`,
  trendUp: html`<path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" />`,
  trendDown: html`<path d="m3 7 6 6 4-4 8 8" /><path d="M17 17h4v-4" />`,
  trash: html`<path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />`,
  x: html`<path d="M18 6 6 18M6 6l12 12" />`,
  check: html`<path d="M20 6 9 17l-5-5" />`,
  alert: html`<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
    <path d="M12 9v4M12 17h.01" />`,
  refresh: html`<path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />`,
  install: html`<path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />`,
  wifiOff: html`<path d="m2 2 20 20" />
    <path d="M8.5 8.5a11 11 0 0 1 12 2.5" />
    <path d="M5 12.5a11 11 0 0 1 3.5-2" />
    <path d="M2 8.8a16 16 0 0 1 4.5-2.6" />
    <path d="M10.5 15.5a5 5 0 0 1 3 0" /><path d="M12 19h.01" />`,
  chart: html`<path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" />
    <rect x="12" y="8" width="3" height="10" />
    <rect x="17" y="5" width="3" height="13" />`,
  eye: html`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />`,
  eyeOff: html`<path d="m3 3 18 18" />
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2" />
    <path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" />`,
  copy: html`<rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
  file: html`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />`,
  arrowRight: html`<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />`,
  info: html`<circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />`,
  clock: html`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`,
  logout: html`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" /><path d="M21 12H9" />`,
};

export function icon(name: IconName, className = 'size-4'): TemplateResult {
  return html`<svg
    class=${className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    ${paths[name]}
  </svg>`;
}
