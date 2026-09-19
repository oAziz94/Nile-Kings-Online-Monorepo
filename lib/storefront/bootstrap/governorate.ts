import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { getStorefrontAddressFromCookies, type StorefrontAddress } from "@/lib/storefront-location";

export type GovernorateOption = { value: string; label: string };

export type GovernorateBootstrapData = {
  address: StorefrontAddress | null;
  options: GovernorateOption[];
};

/**
 * Shared body of `GET /api/storefront/governorate`, also used by `GET /api/storefront/bootstrap`
 * (backlog 6.2). The POST handler (save address) stays on the original route unchanged.
 */
export async function getGovernorateBootstrapData(): Promise<GovernorateBootstrapData> {
  const address = await getStorefrontAddressFromCookies();
  return { address, options: GOVERNORATE_OPTIONS };
}
