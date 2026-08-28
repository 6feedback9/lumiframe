// Full-page split-view layout (product ask, from a reference screenshot:
// a full-screen two-column takeover — photo/guidance on one side, product +
// cart on the other — instead of a floating bottom-sheet card). Visual
// language stays clean/minimal per the original product spec §45, just
// restructured into two persistent panels. `lf-` prefix avoids collision
// with a merchant's own CSS.

export const WIDGET_CSS = `
.lf-backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: #fff;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  animation: lfFade .2s ease;
}
@keyframes lfFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes lfSpin { to { transform: rotate(360deg) } }

.lf-shell {
  position: relative;
  width: 100%;
  margin: 0 auto;
  /* min-height: 100vh unconditionally, not just on the ≥760px split-view —
     on mobile this was left off, so a short empty-state (just the photo
     box + upload button, no description/tips anymore) sized to its own
     content and left the rest of the screen a flat white gap below it
     instead of centering the box in the screen (product ask:
     "централизуй рамку"). With this, .lf-photo-panel (flex: 1) actually
     has real height to work with, so .lf-col's auto margins (below) can
     center its content inside it — same auto-margin mechanism already
     used for the desktop panels. */
  min-height: 100vh;
  display: flex; flex-direction: column;
}
@media (min-width: 760px) { .lf-shell { flex-direction: row; } }

.lf-close {
  position: absolute; top: 16px; right: 16px; z-index: 3;
  width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
  background: rgba(0,0,0,.06); color: #333; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.lf-close:hover { background: rgba(0,0,0,.12); }

.lf-photo-panel {
  flex: 1; min-width: 0; background: #f6f6f5;
  /* justify-content: flex-start, not center — on a viewport shorter than
     the panel's content (a real, common case: this column alone can run
     taller than 900px with the photo box + full tip list + button), centering
     pushed the "upload photo" button below the fold instead of leaving it
     reachable near the top. Top-aligned means the button is always visible
     first, and only the tips below it need a scroll if anything does. */
  padding: 40px 22px 32px; display: flex; flex-direction: column; justify-content: flex-start;
}
/* clamp(), not a flat 56px, on the vertical padding — shrinks it on a
   shorter viewport instead of eating into the same fixed 112px no matter
   how little vertical room there is. */
@media (min-width: 760px) { .lf-photo-panel { padding: clamp(20px, 5vh, 52px) 48px; } }

.lf-product-panel {
  flex: 1; min-width: 0; background: #fff;
  padding: 28px 22px 40px; display: flex; flex-direction: column; justify-content: flex-start;
  border-top: 1px solid #ececec;
}
@media (min-width: 760px) { .lf-product-panel { padding: clamp(20px, 5vh, 52px) 48px; border-top: none; border-left: 1px solid #ececec; } }

/* Mobile only (product ask: "централізуй" — center it): the eyebrow and
   heading read left-aligned-in-a-column as slightly off on a narrow phone
   screen; centered matches the rest of the mobile layout (the upload
   button and photo box already read as centered, being full-width). */
@media (max-width: 759px) {
  .lf-eyebrow, .lf-head { text-align: center; }
}

/* Mobile only (product ask): the product panel — photo/name/price and
   "Add to cart" — only makes sense once there's a result to actually add
   to cart alongside; before that it was just clutter above/below the
   upload step on a small screen the shopper has to scroll past. Desktop's
   side-by-side layout keeps it visible throughout — there's no scroll
   conflict there, and a shopper should still be able to buy without
   trying on (see .lf-product-panel above). .lf-shell.lf-has-result is
   toggled by setPhotoState() in index.ts. */
@media (max-width: 759px) {
  .lf-product-panel { display: none; }
  .lf-shell.lf-has-result .lf-product-panel { display: flex; }
}

/* margin: auto (not justify-content: center on the parent) — auto margins
   on a flex item absorb free space when there's room, giving the same
   vertically-centered look for short content, but collapse to 0 instead
   of going negative when content is taller than the panel, so it starts
   flush at the top rather than overflowing above the fold too. */
.lf-col { width: 100%; max-width: 360px; margin: auto auto; }

.lf-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; }
.lf-head { font-size: 21px; font-weight: 800; letter-spacing: -.01em; text-transform: uppercase; margin-bottom: 16px; color: #111; }

.lf-zone {
  position: relative; border-radius: 18px; overflow: hidden;
  background: #e7e7e6; aspect-ratio: 3 / 4;
  /* Caps how tall this gets on a short viewport. The image still crops to
     fill via object-fit below; this just stops the placeholder box from
     dictating the whole panel's height. Sized generously — the description
     paragraph and tips checklist that used to sit around it are gone
     (product ask: cut the instructional text, give that room to the photo
     itself instead), so there's more height to spend on it than before. */
  max-height: 56vh;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.lf-finput { position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 2; }
.lf-preview, .lf-result-img { width: 100%; height: 100%; object-fit: cover; display: none; }
.lf-zone.has-photo .lf-preview,
.lf-zone.has-result .lf-result-img { display: block; }
.lf-zone.has-result .lf-preview { display: none; }

.lf-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #b0b0af; }
.lf-zone.has-photo .lf-placeholder, .lf-zone.has-result .lf-placeholder { display: none; }
.lf-placeholder-icon { font-size: 40px; margin-bottom: 10px; opacity: .55; }

.lf-photo-badge {
  position: absolute; top: 12px; left: 12px; z-index: 1;
  background: rgba(255,255,255,.94); color: #444; font-size: 10px; font-weight: 700;
  letter-spacing: .05em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px;
}
.lf-zone.has-photo .lf-photo-badge, .lf-zone.has-result .lf-photo-badge { display: none; }

.lf-processing-overlay {
  position: absolute; inset: 0; z-index: 3;
  background: rgba(255,255,255,.88);
  display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;
}
.lf-zone.is-processing .lf-processing-overlay { display: flex; }
.lf-spinner { width: 34px; height: 34px; margin-bottom: 14px; border: 2.5px solid #e2e2e2; border-top-color: var(--lf-accent-1, #73b7ff); border-radius: 50%; animation: lfSpin .8s linear infinite; }
.lf-gen-title { font-size: 13px; font-weight: 700; color: #222; margin-bottom: 4px; }
.lf-gen-sub { font-size: 11px; color: #999; }

.lf-privacy { font-size: 11px; color: #b8b8b8; margin-top: 10px; line-height: 1.45; }
.lf-error { background: #fff2f2; color: #d00; border-radius: 10px; padding: 10px 14px; font-size: 12px; margin-top: 10px; }

.lf-consent { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; }
.lf-consent input { margin-top: 2px; flex-shrink: 0; width: 15px; height: 15px; accent-color: var(--lf-accent-1, #73b7ff); }
.lf-consent label { font-size: 12px; color: #888; line-height: 1.45; cursor: pointer; }

.lf-btn {
  width: 100%; padding: 14px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700;
  letter-spacing: .02em; text-transform: uppercase;
  cursor: pointer; margin-top: 12px; transition: filter .15s, opacity .15s, background .15s;
  font-family: inherit;
}
.lf-btn:disabled { opacity: .45; cursor: default; }
.lf-btn-primary { background: var(--lf-btn-bg, linear-gradient(135deg, #73b7ff, #9f8cff)); color: var(--lf-accent-contrast, #071224); }
.lf-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.lf-btn-secondary { background: #f0f0f0; color: #222; }
.lf-btn-secondary:hover:not(:disabled) { background: #e4e4e4; }

.lf-ai-note { font-size: 11px; color: #aaa; text-align: center; margin-bottom: 6px; line-height: 1.5; }

.lf-feedback { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
.lf-feedback-prompt { font-size: 12px; color: #999; }
.lf-fb-btn {
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid #eee; background: #fff;
  cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
  transition: background .15s, border-color .15s, transform .1s;
}
.lf-fb-btn:hover { background: #f5f5f5; }
.lf-fb-btn:active { transform: scale(.92); }
.lf-fb-btn.selected { border-color: var(--lf-accent-1, #73b7ff); background: color-mix(in srgb, var(--lf-accent-1, #73b7ff) 14%, white); }
.lf-feedback-thanks { font-size: 11px; color: var(--lf-accent-1, #73b7ff); text-align: center; margin-bottom: 8px; }

.lf-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.lf-actions .lf-btn { margin-top: 0; flex: 1 1 140px; }
.lf-actions:empty { display: none; }

.lf-product { display: flex; gap: 16px; align-items: center; margin-bottom: 26px; }
/* object-fit: contain, not cover, in a roughly square box — a merchant's
   product photo can be any aspect ratio (glasses shots especially tend to
   be wide/landscape), and cover into a taller-than-wide 84x104 box was
   cropping real content out (e.g. one temple arm). contain always shows
   the whole photo; the background fills whatever letterbox space is left. */
.lf-pimg { width: 108px; height: 108px; object-fit: contain; border-radius: 12px; background: #f2f2f1; flex-shrink: 0; }
.lf-pname { font-size: 15px; font-weight: 700; line-height: 1.35; margin-bottom: 4px; color: #111; }
.lf-pprice { font-size: 15px; font-weight: 700; color: #111; }

.lf-cart-hint { font-size: 11px; color: #aaa; margin-top: 8px; text-align: center; line-height: 1.5; }

.lf-brand-footer { text-align: center; font-size: 10px; color: #ccc; letter-spacing: .06em; text-transform: uppercase; margin-top: 22px; }
`;
