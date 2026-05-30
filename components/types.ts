export type Category =
  | "technik"
  | "auffindbarkeit"
  | "content"
  | "ki_sichtbarkeit";

export interface Check {
  key: string;
  category: Category | string;
  score: number; // 0..1
  label: string;
  detail: string;
  fix?: string;
}

export interface CategoryScore {
  category: Category;
  score: number; // 0..100
}

export interface ScanResult {
  url: string;
  domain: string;
  total: number; // 0..100
  categories: CategoryScore[];
  checks: Check[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  technik: "Technik",
  auffindbarkeit: "Auffindbarkeit",
  content: "Content",
  ki_sichtbarkeit: "KI-Sichtbarkeit",
};
