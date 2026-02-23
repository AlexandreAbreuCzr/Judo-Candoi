import type {
  ExperimentalClassLeadRequestDTO,
  ExperimentalClassLeadResponseDTO,
  SiteContentResponseDTO
} from "../types/site";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";
const API_ASSET_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch (_error) {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:8080";
  }
})();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const fallbackMessage = `Falha na requisicao (${response.status})`;
      let message = fallbackMessage;

      try {
        const body = (await response.json()) as { message?: string };
        message = body.message ?? fallbackMessage;
      } catch (_error) {
        message = fallbackMessage;
      }

      throw new Error(message);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getSiteContent(): Promise<SiteContentResponseDTO> {
  return request<SiteContentResponseDTO>("/site/content", { method: "GET" });
}

export function createExperimentalClassLead(
  payload: ExperimentalClassLeadRequestDTO
): Promise<ExperimentalClassLeadResponseDTO> {
  return request<ExperimentalClassLeadResponseDTO>("/leads/experimental-class", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function resolveSiteAssetUrl(url?: string | null): string {
  if (!url) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  if (url.startsWith("/uploads/")) {
    return `${API_ASSET_ORIGIN}${url}`;
  }

  return url;
}
