import type { UtmContext } from "./utm";
import type { WidgetProduct } from "./types";

export interface CreateTryOnResponse {
  tryOnId: string;
  generationId: string;
  status: string;
  visitorId?: string;
}

export interface TryOnStatusResponse {
  tryOnId: string;
  generationId?: string;
  status: "CREATED" | "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";
  resultUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly storeId: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async createTryOn(params: {
    product: WidgetProduct;
    customerImageDataUri: string;
    visitorId: string;
    browserSessionId: string;
    referrer?: string;
    device?: string;
    utm?: UtmContext;
  }): Promise<CreateTryOnResponse> {
    const res = await fetch(this.url("/api/v1/tryons"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: this.storeId,
        product: {
          id: params.product.productId,
          title: params.product.productTitle,
          imageUrl: params.product.productImageUrl,
          url: params.product.productUrl,
          sku: params.product.sku,
          price: params.product.price,
          currency: params.product.currency,
        },
        customerImage: params.customerImageDataUri,
        visitorId: params.visitorId,
        browserSessionId: params.browserSessionId,
        referrer: params.referrer,
        device: params.device,
        utm: params.utm,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to create try-on (HTTP ${res.status})`);
    }
    return res.json();
  }

  async retryTryOn(tryOnId: string, customerImageDataUri: string): Promise<CreateTryOnResponse> {
    const res = await fetch(this.url(`/api/v1/tryons/${tryOnId}/retry?storeId=${encodeURIComponent(this.storeId)}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerImage: customerImageDataUri }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to retry try-on (HTTP ${res.status})`);
    }
    return res.json();
  }

  async getStatus(tryOnId: string): Promise<TryOnStatusResponse> {
    const res = await fetch(this.url(`/api/v1/tryons/${tryOnId}?storeId=${encodeURIComponent(this.storeId)}`));
    if (!res.ok) throw new Error(`Failed to fetch try-on status (HTTP ${res.status})`);
    return res.json();
  }

  async postEvent(event: {
    type: string;
    tryOnSessionId?: string;
    externalProductId?: string;
    visitorId: string;
    browserSessionId?: string;
    referrer?: string;
    device?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await fetch(this.url("/api/v1/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: this.storeId, ...event }),
      keepalive: true,
    }).catch(() => {
      // Best-effort — a dropped analytics event must never block the UX.
    });
  }

  /** Reads a File into a base64 data: URI for the inline-upload contract (packages/sdk README). */
  static async fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
