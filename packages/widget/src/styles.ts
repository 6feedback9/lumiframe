// Visual language carried over from the original LumiOn MVP's widget.js
// (see the `lumion` repo, backend/public/widget.js) — clean, minimal,
// "a feature of the store, not leaving the store" (product spec §45).
// Renamed to an `lf-` prefix to avoid any collision with a merchant's own
// CSS or a page that also happens to load the legacy widget.

export const WIDGET_CSS = `
.lf-backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: flex-end; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  animation: lfFade .2s ease;
}
@media (min-width: 560px) { .lf-backdrop { align-items: center; padding: 20px; } }
@keyframes lfFade { from { opacity: 0 } to { opacity: 1 } }

.lf-modal {
  background: #fff; color: #111;
  border-radius: 20px 20px 0 0;
  width: 100%; max-width: var(--lf-modal-width, 560px);
  max-height: 92vh; overflow-y: auto;
  box-shadow: 0 -8px 60px rgba(0,0,0,.2);
  animation: lfUp .28s cubic-bezier(.34,1.4,.64,1);
}
@media (min-width: 560px) {
  .lf-modal { border-radius: 20px; box-shadow: 0 32px 80px rgba(0,0,0,.25); animation: lfScale .24s cubic-bezier(.34,1.4,.64,1); }
}
@keyframes lfUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes lfScale { from { transform: scale(.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }

.lf-header {
  position: sticky; top: 0; background: #fff; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 12px; border-bottom: 1px solid #f0f0f0;
}
.lf-brand { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #111; }
.lf-close {
  width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
  background: #f2f2f2; color: #777; font-size: 14px; display: flex; align-items: center; justify-content: center;
}
.lf-close:hover { background: #e6e6e6; color: #111; }

.lf-body { padding: 16px 18px 22px; }
@media (min-width: 560px) { .lf-body { padding: 20px 26px 28px; } }

.lf-product { display: flex; gap: 12px; align-items: center; background: #f8f8f8; border-radius: 12px; padding: 10px; margin-bottom: 16px; }
.lf-pimg { width: 48px; height: 60px; object-fit: cover; border-radius: 8px; background: #eee; flex-shrink: 0; }
.lf-pname { font-size: 12px; font-weight: 500; line-height: 1.4; }
.lf-pprice { font-size: 12px; color: #999; margin-top: 2px; }

.lf-head { font-size: 18px; font-weight: 600; margin-bottom: 4px; letter-spacing: -.01em; }
.lf-desc { font-size: 13px; color: #999; line-height: 1.5; margin-bottom: 16px; }

.lf-zone {
  border: 1.5px dashed #ddd; border-radius: 14px; background: #fafafa; cursor: pointer;
  min-height: 220px; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden; transition: border-color .15s, background .15s;
}
.lf-zone:hover { border-color: #73b7ff; background: #f5f5f5; }
.lf-zone.has-photo { border-style: solid; border-color: #73b7ff; min-height: unset; background: #fff; }
.lf-finput { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.lf-preview { width: 100%; max-height: 300px; object-fit: contain; display: none; }
.lf-zone.has-photo .lf-preview { display: block; }
.lf-zone.has-photo .lf-placeholder { display: none; }
.lf-placeholder { padding: 24px; text-align: center; }
.lf-placeholder-icon { font-size: 28px; margin-bottom: 10px; }
.lf-upload-text { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.lf-upload-hint { font-size: 12px; color: #bbb; }

.lf-privacy { font-size: 11px; color: #c0c0c0; text-align: center; margin-top: 10px; line-height: 1.5; }
.lf-error { background: #fff2f2; color: #d00; border-radius: 10px; padding: 10px 14px; font-size: 12px; margin-top: 10px; }

.lf-btn {
  width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 14px; font-weight: 600;
  cursor: pointer; margin-top: 12px; transition: background .15s, opacity .15s;
  font-family: inherit;
}
.lf-btn:disabled { opacity: .5; cursor: default; }
.lf-btn-primary { background: linear-gradient(135deg, #73b7ff, #9f8cff); color: #071224; }
.lf-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.lf-btn-secondary { background: #f2f2f2; color: #111; }
.lf-btn-secondary:hover:not(:disabled) { background: #e6e6e6; }

.lf-generating { text-align: center; padding: 54px 18px 46px; }
.lf-spinner { width: 38px; height: 38px; margin: 0 auto 20px; border: 2.5px solid #eee; border-top-color: #73b7ff; border-radius: 50%; animation: lfSpin .8s linear infinite; }
@keyframes lfSpin { to { transform: rotate(360deg) } }
.lf-gen-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.lf-gen-sub { font-size: 12px; color: #aaa; }

.lf-result-img { width: 100%; border-radius: 12px; display: block; max-height: 460px; object-fit: contain; background: #f8f8f8; }
.lf-ai-note { font-size: 11px; color: #bbb; text-align: center; margin-top: 8px; }
.lf-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.lf-actions .lf-btn { margin-top: 0; flex: 1 1 140px; }
.lf-actions:empty { margin-top: 0; }

.lf-footer { text-align: center; padding: 12px 18px 18px; font-size: 10px; color: #ddd; letter-spacing: .06em; text-transform: uppercase; border-top: 1px solid #f5f5f5; margin-top: 4px; }
`;
