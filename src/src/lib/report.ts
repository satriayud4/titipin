import { supabase } from './supabase'

export interface Summary {
  omzet: number
  cogs: number
  rusak_cost: number
  transactions: number
  items_sold: number
  tunai: number
  transfer: number
  qris: number
}
export interface DayRow {
  day: string
  omzet: number
  cogs: number
  rusak_cost: number
  transactions: number
}
export interface SupplierRow {
  name: string
  qty: number
  omzet: number
  cogs: number
  rusak_cost: number
}
export interface ProductRow {
  name: string
  qty: number
  omzet: number
  cogs: number
}
export interface ReportData {
  summary: Summary
  daily: DayRow[]
  suppliers: SupplierRow[]
  products: ProductRow[]
}

export async function fetchReport(from: string, to: string): Promise<ReportData> {
  const { data, error } = await supabase.rpc('report_data', { p_from: from, p_to: to })
  if (error) throw error
  return data as ReportData
}

// laba bersih = omzet - modal barang terjual - rugi barang rusak (ditanggung toko)
export const profit = (s: { omzet: number; cogs: number; rusak_cost: number }) => s.omzet - s.cogs - s.rusak_cost