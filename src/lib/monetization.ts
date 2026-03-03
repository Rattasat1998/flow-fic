export type CoinPackage = {
  id: string;
  coins: number;
  priceThb: number;
  bonus: number;
  popular?: boolean;
};

export const COIN_PACKAGES: CoinPackage[] = [
  { id: '1', coins: 50, priceThb: 10, bonus: 0 },
  { id: '2', coins: 150, priceThb: 29, bonus: 5 },
  { id: '3', coins: 300, priceThb: 59, bonus: 20, popular: true },
  { id: '4', coins: 500, priceThb: 99, bonus: 50 },
  { id: '5', coins: 1200, priceThb: 229, bonus: 150 },
  { id: '6', coins: 3000, priceThb: 549, bonus: 500 },
];

export const VIP_MONTHLY_PRICE_THB = 99;
export const VIP_PLAN_CODE = 'vip_monthly';

export const getCoinPackageById = (packageId: string) =>
  COIN_PACKAGES.find((pkg) => pkg.id === packageId) || null;

export const getCoinPackageTotalCoins = (pkg: CoinPackage) => pkg.coins + pkg.bonus;
