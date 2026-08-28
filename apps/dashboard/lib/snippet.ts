// Builds the exact <script> snippet a merchant pastes into their site —
// shared by IntegrationSnippet.tsx (register/integration pages) and the
// Customize page's live preview, so both always agree on what
// TryOn.init(...) actually gets called with.

export interface WidgetConfig {
  buttonText?: string;
  buttonColorStart?: string;
  buttonColorEnd?: string;
  buttonTextColor?: string;
  buttonFont?: string;
  buttonGlow?: boolean;
  buttonStyle?: "gradient" | "solid";
  buttonSize?: "sm" | "md" | "lg";
  buttonAnimation?: "none" | "pulse" | "shimmer";
  buttonPosition?: "before" | "after" | "floating";
  buttonAnchorSelector?: string;
  modalMaxWidth?: number;
  showTryAnotherButton?: boolean;
  showBackButton?: boolean;
  modalHeading?: string;
  modalSubheading?: string;
  modalAccentColorStart?: string;
  modalAccentColorEnd?: string;
  modalAccentTextColor?: string;
}

export function buildInitOptions(storeId: string, apiBaseUrl: string, config: WidgetConfig = {}): Record<string, unknown> {
  const options: Record<string, unknown> = { storeId, apiBaseUrl };
  if (config.buttonText) options.buttonLabel = config.buttonText;
  if (config.buttonColorStart) options.buttonColorStart = config.buttonColorStart;
  if (config.buttonColorEnd) options.buttonColorEnd = config.buttonColorEnd;
  if (config.buttonTextColor) options.buttonTextColor = config.buttonTextColor;
  if (config.buttonFont) options.buttonFont = config.buttonFont;
  if (config.buttonGlow) options.buttonGlow = true;
  if (config.buttonStyle) options.buttonStyle = config.buttonStyle;
  if (config.buttonSize) options.buttonSize = config.buttonSize;
  if (config.buttonAnimation && config.buttonAnimation !== "none") options.buttonAnimation = config.buttonAnimation;
  if (config.buttonPosition && config.buttonPosition !== "after") options.buttonPosition = config.buttonPosition;
  if (config.buttonAnchorSelector) options.buttonAnchorSelector = config.buttonAnchorSelector;
  if (config.modalMaxWidth) options.modalMaxWidth = config.modalMaxWidth;
  if (config.showTryAnotherButton === false) options.showTryAnotherButton = false;
  if (config.showBackButton === false) options.showBackButton = false;
  if (config.modalHeading) options.modalHeading = config.modalHeading;
  if (config.modalSubheading) options.modalSubheading = config.modalSubheading;
  if (config.modalAccentColorStart) options.modalAccentColorStart = config.modalAccentColorStart;
  if (config.modalAccentColorEnd) options.modalAccentColorEnd = config.modalAccentColorEnd;
  if (config.modalAccentTextColor) options.modalAccentTextColor = config.modalAccentTextColor;
  return options;
}

/** Pretty-prints a TryOn.init({...}) options object the way a merchant would paste it — one key per line, unquoted keys. */
function formatOptionsLiteral(options: Record<string, unknown>): string {
  const lines = Object.entries(options).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`);
  return `{\n${lines.join("\n")}\n  }`;
}

export function buildSnippet(storeId: string, apiBaseUrl: string, config: WidgetConfig = {}): string {
  const options = buildInitOptions(storeId, apiBaseUrl, config);
  return `<script src="${apiBaseUrl}/sdk.js"></script>
<script>
  TryOn.init(${formatOptionsLiteral(options)});
  // Optional: on an unknown platform, tell it exactly what to read —
  // otherwise it tries JSON-LD, then OpenGraph, automatically.
  // TryOn.attach({ productId: "...", productImageUrl: "...", ... });
</script>`;
}
