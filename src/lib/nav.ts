import {
  Boxes,
  ChartColumn,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  Package,
  PackagePlus,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../auth/AuthContext'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  superOnly?: boolean
}

export const canSee = (item: NavItem, role: Role, isSuper: boolean) =>
  (!item.superOnly || isSuper) && (!item.roles || item.roles.includes(role))

export const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Utama',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/kasir', label: 'Kasir', icon: ShoppingCart },
    ],
  },
  {
    title: 'Stok',
    items: [
      { to: '/barang-masuk', label: 'Barang Masuk', icon: PackagePlus },
      { to: '/stok', label: 'Stok', icon: Boxes },
      { to: '/retur', label: 'Retur', icon: Undo2 },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { to: '/setoran', label: 'Setoran Supplier', icon: HandCoins },
      { to: '/laporan', label: 'Laporan', icon: ChartColumn },
    ],
  },
  {
    title: 'Master data',
    items: [
      { to: '/produk', label: 'Produk', icon: Package },
      { to: '/kategori', label: 'Kategori', icon: Tags },
      { to: '/supplier', label: 'Supplier', icon: Truck },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/pembayaran', label: 'Pembayaran', icon: CreditCard, roles: ['admin'] },
      { to: '/pengguna', label: 'Pengguna', icon: Users, superOnly: true },
      { to: '/pengaturan', label: 'Pengaturan Toko', icon: Settings, superOnly: true },
    ],
  },
]

export const TABS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/kasir', label: 'Kasir', icon: ShoppingCart },
  { to: '/stok', label: 'Stok', icon: Boxes },
  { to: '/laporan', label: 'Laporan', icon: ChartColumn },
]