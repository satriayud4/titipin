import {
  Cake,
  CalendarOff,
  Coffee,
  HandCoins,
  Heart,
  Moon,
  Package,
  PartyPopper,
  Rocket,
  Smile,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

/** Ikon yang boleh dipilih AI untuk sapaan dashboard. Nama harus sama dengan daftar di fungsi asisten-ai. */
export const AI_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'party-popper': PartyPopper,
  coffee: Coffee,
  moon: Moon,
  sun: Sun,
  cake: Cake,
  heart: Heart,
  'triangle-alert': TriangleAlert,
  package: Package,
  'hand-coins': HandCoins,
  'calendar-off': CalendarOff,
  rocket: Rocket,
  smile: Smile,
}
export const aiIcon = (name: string | undefined): LucideIcon => (name && AI_ICONS[name]) || Sparkles
