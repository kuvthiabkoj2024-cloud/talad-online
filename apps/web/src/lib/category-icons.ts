import { Baby, Dumbbell, PawPrint, Shirt, Smartphone, Sofa, Sparkles, Tag, UtensilsCrossed, type LucideIcon } from "lucide-react";

/** Icons by top-level category slug, used until admins upload category icons (§2.6). */
const ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  fashion: Shirt,
  electronics: Smartphone,
  home: Sofa,
  beauty: Sparkles,
  baby: Baby,
  pets: PawPrint,
  sports: Dumbbell,
};

export const categoryIcon = (slug: string): LucideIcon => ICONS[slug] ?? Tag;
