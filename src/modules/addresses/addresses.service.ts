import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type AddressSuggestion = {
  id: string;
  label: string;
  line: string;
  city?: string;
  postcode?: string;
  source: "woosmap" | "postcodes.io";
};

@Injectable()
export class AddressesService {
  constructor(private readonly config: ConfigService) {}

  async search(query: string): Promise<AddressSuggestion[]> {
    const key = this.config.get<string>("WOOSMAP_API_KEY");
    const normalizedQuery = query.trim();
    if (key && normalizedQuery.length > 2) {
      try {
        const url = new URL("https://api.woosmap.com/localities/autocomplete/");
        url.searchParams.set("key", key);
        url.searchParams.set("input", normalizedQuery);
        url.searchParams.set("language", "en");
        url.searchParams.set("components", "country:gb");
        url.searchParams.set("types", "postal_code,address");
        const response = await fetch(url);
        const data = (await response.json()) as {
          localities?: Array<{ public_id: string; description: string; matched_substrings?: unknown[] }>;
        };
        const suggestions = (data.localities ?? []).map((item) => ({
          id: item.public_id,
          label: item.description,
          line: item.description,
          source: "woosmap" as const
        }));
        if (suggestions.length) return suggestions;
      } catch {
        // Fall through to the no-key postcode lookup.
      }
    }

    const postcodeSuggestions = await this.postcodeSuggestions(normalizedQuery);
    if (postcodeSuggestions.length) return postcodeSuggestions;

    return [];
  }

  private async postcodeSuggestions(query: string): Promise<AddressSuggestion[]> {
    if (query.length < 2) return [];
    try {
      const exact = await this.lookupPostcode(query);
      if (exact) return [exact];

      const url = new URL(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}/autocomplete`);
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as { result?: string[] };
      return (data.result ?? []).slice(0, 8).map((postcode) => ({
        id: `postcodes-io-${postcode}`,
        label: postcode,
        line: postcode,
        postcode,
        source: "postcodes.io" as const
      }));
    } catch {
      return [];
    }
  }

  private async lookupPostcode(query: string): Promise<AddressSuggestion | undefined> {
    try {
      const url = new URL(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`);
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const data = (await response.json()) as {
        result?: {
          postcode?: string;
          admin_district?: string;
          admin_ward?: string;
          region?: string;
          country?: string;
          parish?: string;
        };
      };
      const result = data.result;
      if (!result?.postcode) return undefined;
      const parts = [result.admin_ward, result.admin_district, result.region].filter(Boolean);
      const line = [result.postcode, ...parts].join(", ");
      return {
        id: `postcodes-io-${result.postcode}`,
        label: line,
        line,
        city: result.admin_district,
        postcode: result.postcode,
        source: "postcodes.io"
      };
    } catch {
      return undefined;
    }
  }

}
