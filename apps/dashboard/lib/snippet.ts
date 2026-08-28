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
}

export function buildInitOptions(storeId: string, apiBaseUrl: string, config: WidgetConfig = {}): Record<string, unknown> {
  const options: Record<string, unknown> = { storeId, apiBaseUrl };
  if (config.buttonText) options.buttonLabel = config.buttonText;
  if (config.buttonColorStart) options.buttonColorStart = config.buttonColorStart;
  if (config.buttonColorEnd) options.buttonColorEnd = config.buttonColorEnd;
  if (config.buttonTextColor) options.buttonTextColor = config.buttonTextColor;
  if (config.buttonFont) options.buttonFont = config.buttonFont;
  if (config.buttonGlow) options.buttonGlow = true;
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
