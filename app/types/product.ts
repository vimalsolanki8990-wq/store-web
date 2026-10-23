export interface Product {
  id: string;
  name?: string;
  nameGu?: string;
  name_gu?: string;
  nameEn?: string;
  name_en?: string;
  category: string;
  units: string[];
  price: number;
  inStock: boolean;
  photoUrl: string;
  photo_url?: string;
  brand: string;
  stockCount: number;
  quantity?: number;
  originalPrice: number;
  offer: boolean;
  isSpecialOffer?: boolean;
  packing?: string;
}

export function getProductDisplayName(product: Partial<Product> | null | undefined): string {
  if (!product) return "";
  return product.name || product.nameGu || product.nameEn || "Grocery Item";
}
