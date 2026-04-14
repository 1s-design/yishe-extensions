// @ts-nocheck
(function initCoreUiTheme() {
  'use strict';

  if (window.CoreUiTheme) {
    return;
  }

  const STYLE_ID = 'yishe-core-ui-theme-style';

  function ensureBaseStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --yishe-ui-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --yishe-ui-text: #111827;
        --yishe-ui-text-soft: #6b7280;
        --yishe-ui-border: rgba(15, 23, 42, 0.08);
        --yishe-ui-border-strong: rgba(15, 23, 42, 0.18);
        --yishe-ui-surface: rgba(255, 255, 255, 0.72);
        --yishe-ui-surface-strong: rgba(255, 255, 255, 0.96);
        --yishe-ui-overlay: rgba(244, 244, 245, 0.82);
        --yishe-ui-overlay-blur: blur(18px) saturate(135%);
        --yishe-ui-primary: #111827;
        --yishe-ui-primary-strong: #0b1220;
        --yishe-ui-success: rgba(34, 197, 94, 0.92);
        --yishe-ui-error: rgba(239, 68, 68, 0.92);
        --yishe-ui-warning: rgba(245, 158, 11, 0.92);
        --yishe-ui-shadow-soft: 0 10px 24px rgba(15, 23, 42, 0.06);
        --yishe-ui-shadow-medium: 0 18px 36px rgba(15, 23, 42, 0.08);
        --yishe-ui-shadow-strong: 0 12px 24px rgba(17, 24, 39, 0.16);
        --yishe-ui-radius-pill: 999px;
        --yishe-ui-radius-lg: 20px;
        --yishe-ui-focus: 0 0 0 2px rgba(17, 24, 39, 0.22);
      }

      .yishe-ui-overlay {
        background: var(--yishe-ui-overlay);
        backdrop-filter: var(--yishe-ui-overlay-blur);
        -webkit-backdrop-filter: var(--yishe-ui-overlay-blur);
        font-family: var(--yishe-ui-font);
      }

      .yishe-ui-surface {
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98) 0%, rgba(244, 244, 245, 0.99) 100%);
        color: var(--yishe-ui-text);
      }

      .yishe-ui-icon-btn {
        appearance: none;
        border: 1px solid var(--yishe-ui-border);
        width: 38px;
        height: 38px;
        border-radius: var(--yishe-ui-radius-pill);
        background: var(--yishe-ui-surface);
        color: var(--yishe-ui-text);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
      }

      .yishe-ui-icon-btn:hover {
        background: var(--yishe-ui-surface-strong);
        border-color: var(--yishe-ui-border-strong);
        transform: translateY(-1px) scale(1.04);
        box-shadow: var(--yishe-ui-shadow-soft);
      }

      .yishe-ui-icon-btn:active {
        transform: scale(0.96);
      }

      .yishe-ui-icon-btn:focus-visible {
        outline: none;
        box-shadow: var(--yishe-ui-shadow-soft), var(--yishe-ui-focus);
      }

      .yishe-ui-chip {
        appearance: none;
        border: 1px solid var(--yishe-ui-border);
        border-radius: var(--yishe-ui-radius-pill);
        min-height: 38px;
        padding: 0 14px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        color: var(--yishe-ui-text);
        background: var(--yishe-ui-surface);
        transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
      }

      .yishe-ui-chip:hover {
        background: var(--yishe-ui-surface-strong);
        border-color: var(--yishe-ui-border-strong);
        transform: translateY(-1px) scale(1.035);
        box-shadow: var(--yishe-ui-shadow-soft);
      }

      .yishe-ui-chip:active {
        transform: translateY(0) scale(0.985);
      }

      .yishe-ui-chip:focus-visible {
        outline: none;
        box-shadow: var(--yishe-ui-shadow-soft), var(--yishe-ui-focus);
      }

      .yishe-ui-chip:disabled {
        cursor: not-allowed;
        opacity: 0.46;
        transform: none;
        box-shadow: none;
      }

      .yishe-ui-chip--primary {
        color: #fff;
        background: var(--yishe-ui-primary);
        border-color: var(--yishe-ui-primary);
        box-shadow: var(--yishe-ui-shadow-strong);
      }

      .yishe-ui-chip--primary:hover {
        background: var(--yishe-ui-primary-strong);
        border-color: var(--yishe-ui-primary-strong);
      }

      .yishe-ui-chip--secondary {
        background: rgba(17, 24, 39, 0.06);
        border-color: rgba(17, 24, 39, 0.06);
      }

      .yishe-ui-chip--ghost {
        background: transparent;
      }
    `;

    document.head.appendChild(style);
  }

  window.CoreUiTheme = {
    ensureBaseStyles,
    styleId: STYLE_ID,
  };
})();
