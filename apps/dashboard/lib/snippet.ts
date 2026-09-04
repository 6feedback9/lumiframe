// Builds the exact <script> snippet a merchant pastes into their site —
// shared by IntegrationSnippet.tsx (register/integration pages) and the
// Customize page's live preview, so both always agree on what
// TryOn.init(...) actually gets called with.

export interface WidgetConfig {
  /** Try-on window language. Defaults to Ukrainian when unset — see packages/sdk. */
  language?: "en" | "uk" | "ru";
  buttonText?: string;
  buttonColorStart?: string;
  buttonColorEnd?: string;
  buttonTextColor?: string;
  buttonFont?: string;
  buttonGlow?: boolean;
  buttonStyle?: "gradient" | "solid" | "outline";
  /** Continuous scale, percent of the default size. 100 = default. */
  buttonSize?: number;
  /** Horizontal-only stretch on top of buttonSize. 100 = default (no stretch). */
  buttonWidth?: number;
  /** Explicit label text size in px (10-28), independent of buttonSize. Unset — the label keeps scaling with buttonSize as before. */
  buttonFontSize?: number;
  /** Explicit label font-weight (300-900). Unset defaults to 600. */
  buttonFontWeight?: number;
  /** Stretches the button to fill its container's full width, matching a theme's own "Add to cart" edge-to-edge instead of the button's natural content width. Default false. */
  buttonFullWidth?: boolean;
  buttonShape?: "rounded" | "rectangular";
  buttonAnimation?: "none" | "pulse" | "shimmer";
  buttonPosition?: "before" | "after" | "floating" | "inline";
  buttonAnchorSelector?: string;
  /** CSS selector for the page's live product image, for stores with color/style
   * swatches — see packages/sdk/README.md's "Products with multiple colors/styles". */
  productImageSelector?: string;
  showTryAnotherButton?: boolean;
  showBackButton?: boolean;
  modalHeading?: string;
  modalSubheading?: string;
  modalAccentColorStart?: string;
  modalAccentColorEnd?: string;
  modalAccentTextColor?: string;
  /** "split" (default) — full-page takeover. "compact" — a small floating
   * card over the dimmed, still-visible product page instead. */
  modalLayout?: "split" | "compact";
  /** Adds a smaller "Try on" affordance to every product card on a
   * catalog/collection page — see packages/sdk's TryOnInitOptions. Reuses
   * buttonColorStart/End/TextColor/Style above, no separate color config. */
  cardButtonEnabled?: boolean;
  cardButtonVariant?: "corner" | "drawer" | "scrim";
  /** Comma-separated keywords — the widget only shows itself on a product
   * page (or catalog card) whose URL contains at least one of them. Empty/
   * unset means everywhere, unchanged from before — see packages/sdk's
   * TryOnInitOptions.categoryUrlKeywords doc comment. */
  categoryUrlKeywords?: string;
}

export function buildInitOptions(storeId: string, apiBaseUrl: string, config: WidgetConfig = {}): Record<string, unknown> {
  const options: Record<string, unknown> = { storeId, apiBaseUrl };
  if (config.language && config.language !== "uk") options.locale = config.language;
  if (config.buttonText) options.buttonLabel = config.buttonText;
  if (config.buttonColorStart) options.buttonColorStart = config.buttonColorStart;
  if (config.buttonColorEnd) options.buttonColorEnd = config.buttonColorEnd;
  if (config.buttonTextColor) options.buttonTextColor = config.buttonTextColor;
  if (config.buttonFont) options.buttonFont = config.buttonFont;
  if (config.buttonGlow) options.buttonGlow = true;
  if (config.buttonStyle) options.buttonStyle = config.buttonStyle;
  if (config.buttonSize && config.buttonSize !== 100) options.buttonSize = config.buttonSize;
  if (config.buttonWidth && config.buttonWidth !== 100) options.buttonWidth = config.buttonWidth;
  if (config.buttonFontSize) options.buttonFontSize = config.buttonFontSize;
  if (config.buttonFontWeight && config.buttonFontWeight !== 600) options.buttonFontWeight = config.buttonFontWeight;
  if (config.buttonFullWidth) options.buttonFullWidth = true;
  if (config.buttonShape && config.buttonShape !== "rounded") options.buttonShape = config.buttonShape;
  if (config.buttonAnimation && config.buttonAnimation !== "none") options.buttonAnimation = config.buttonAnimation;
  if (config.buttonPosition && config.buttonPosition !== "after") options.buttonPosition = config.buttonPosition;
  if (config.buttonAnchorSelector) options.buttonAnchorSelector = config.buttonAnchorSelector;
  if (config.productImageSelector) options.productImageSelector = config.productImageSelector;
  if (config.showTryAnotherButton === false) options.showTryAnotherButton = false;
  if (config.showBackButton === false) options.showBackButton = false;
  if (config.modalHeading) options.modalHeading = config.modalHeading;
  if (config.modalSubheading) options.modalSubheading = config.modalSubheading;
  if (config.modalAccentColorStart) options.modalAccentColorStart = config.modalAccentColorStart;
  if (config.modalAccentColorEnd) options.modalAccentColorEnd = config.modalAccentColorEnd;
  if (config.modalAccentTextColor) options.modalAccentTextColor = config.modalAccentTextColor;
  if (config.modalLayout && config.modalLayout !== "split") options.modalLayout = config.modalLayout;
  if (config.cardButtonEnabled) options.cardButtonEnabled = true;
  if (config.cardButtonVariant && config.cardButtonVariant !== "corner") options.cardButtonVariant = config.cardButtonVariant;
  if (config.categoryUrlKeywords) options.categoryUrlKeywords = config.categoryUrlKeywords;
  return options;
}

/** Pretty-prints a TryOn.init({...}) options object the way a merchant would paste it — one key per line, unquoted keys. */
function formatOptionsLiteral(options: Record<string, unknown>): string {
  const lines = Object.entries(options).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`);
  return `{\n${lines.join("\n")}\n  }`;
}

export function buildSnippet(storeId: string, apiBaseUrl: string, config: WidgetConfig = {}): string {
  const options = buildInitOptions(storeId, apiBaseUrl, config);
  // No TryOn.attach() usage comment here on purpose — this box is what a
  // non-technical merchant pastes into their theme, and those two lines
  // (JSON-LD/OpenGraph jargon, a manual-override example) were both
  // meaningless to that audience and long enough to overflow the box on
  // the onboarding screen. That advanced-usage guidance still lives in
  // packages/sdk/README.md for whoever's actually wiring up a custom
  // platform integration.
  return `<script src="${apiBaseUrl}/sdk.js"></script>
<script>
  TryOn.init(${formatOptionsLiteral(options)});
</script>`;
}
