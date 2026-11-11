import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type AddressSuggestion = {
  id: string;
  label: string;
  line: string;
  city?: string;
  postcode?: string;
  source: "woosmap";
};

type WoosmapLocality = {
  public_id?: string;
  description?: string;
};

type WoosmapAddress = {
  public_id?: string;
  description?: string;
};

type WoosmapAddressComponent = {
  types?: string[];
  long_name?: string;
};

@Injectable()
export class AddressesService {
  constructor(private readonly config: ConfigService) {}

  async search(query: string): Promise<AddressSuggestion[]> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");
    if (normalizedQuery.length < 2) return [];

    const key = this.config.get<string>("WOOSMAP_API_KEY")?.trim() || "woos-c819f572-d85e-3c98-9b70-36926ff3d715";

    try {
      const url = new URL("https://api.woosmap.com/localities/autocomplete/");
      url.searchParams.set("key", key);
      url.searchParams.set("input", normalizedQuery);
      url.searchParams.set("language", "en");
      url.searchParams.set("components", "country:gb");
      url.searchParams.set("types", "postal_code,address");

      const response = await this.woosmapFetch(url);
      if (!response.ok) throw new ServiceUnavailableException("Address lookup provider rejected the request");
      const data = (await response.json()) as { localities?: WoosmapLocality[] };
      const localities = data.localities ?? [];
      if (!localities.length || !localities[0]?.public_id) return [];

      const publicId = localities[0].public_id;
      return await this.loadLocalityAddresses(publicId, normalizedQuery, key);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Address lookup is temporarily unavailable");
    }
  }

  private async loadLocalityAddresses(publicId: string, query: string, key: string): Promise<AddressSuggestion[]> {
    const url = new URL("https://api.woosmap.com/localities/details/");
    url.searchParams.set("key", key);
    url.searchParams.set("public_id", publicId);
    url.searchParams.set("language", "en");
    url.searchParams.set("components", "country:gb");

    const response = await this.woosmapFetch(url);
    if (!response.ok) throw new ServiceUnavailableException("Address lookup provider rejected the request");
    const data = (await response.json()) as {
      result?: {
        name?: string;
        address_components?: WoosmapAddressComponent[];
        addresses?: { list?: WoosmapAddress[] };
      };
    };
    const result = data.result;
    const postcode = result?.name?.trim() || query.toUpperCase();
    const city = result?.address_components?.find((component) =>
      component.types?.some((type) => type === "district" || type === "locality")
    )?.long_name;

    return (result?.addresses?.list ?? [])
      .filter((item): item is Required<Pick<WoosmapAddress, "description">> & WoosmapAddress => Boolean(item.description?.trim()))
      .map((item, index) => ({
        id: item.public_id || `woosmap-${publicId}-${index}`,
        label: item.description.trim(),
        line: item.description.trim(),
        city,
        postcode,
        source: "woosmap"
      }));
  }

  private woosmapFetch(url: URL) {
    const referer =
      this.config.get<string>("WOOSMAP_REFERER")?.trim() ||
      "https://crm.eelectrics.co.uk/";

    return fetch(url, {
      headers: { Referer: ensureTrailingSlash(referer) },
      signal: AbortSignal.timeout(10_000)
    });
  }
}

function compactPostcode(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
