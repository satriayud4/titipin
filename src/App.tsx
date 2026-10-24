
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { StoreProvider } from './store/StoreContext'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/ConfirmDialog'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import AuthCallback from './pages/AuthCallback'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import Kasir from './pages/Kasir'
import StockIntake from './pages/StockIntake'
import StockPage from './pages/StockPage'
import ReturPage from './pages/ReturPage'
import Setoran from './pages/Setoran'
import Laporan from './pages/Laporan'
import PaymentSettings from './pages/PaymentSettings'
import Pengguna from './pages/Pengguna'
import PengaturanToko from './pages/PengaturanToko'
import Riwayat from './pages/Riwayat'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import { CategoriesPage, ProductsPage, SuppliersPage } from './pages/MasterData'
import PackagesPage from './pages/PackagesPage'
import BuatPaket from './pages/BuatPaket'
import PembelianPaket from './pages/PembelianPaket'
import Kalender from './pages/Kalender'
import Promo from './pages/Promo'

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <Routes>
                {/* Halaman autentikasi: bisa diakses tanpa login */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

                {/* Halaman utama: wajib login */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Home />} />
                  <Route path="/kasir" element={<Kasir />} />
                  <Route path="/barang-masuk" element={<StockIntake />} />
                  <Route path="/stok" element={<StockPage />} />
                  <Route path="/retur" element={<ReturPage />} />
                  <Route path="/setoran" element={<Setoran />} />
                  <Route path="/laporan" element={<Laporan />} />
                  <Route path="/produk" element={<ProductsPage />} />
                  <Route path="/paket" element={<PackagesPage />} />
                  <Route path="/kategori" element={<CategoriesPage />} />
                  <Route path="/supplier" element={<SuppliersPage />} />
                  <Route path="/riwayat" element={<Riwayat />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/paket" element={<PackagesPage />} />
                  <Route path="/paket/buat" element={<BuatPaket />} />
                  <Route path="/paket/:id/ubah" element={<BuatPaket />} />      
                  <Route path="/pembelian-paket" element={<PembelianPaket />} />
                  <Route path="/kalender" element={<Kalender />} />
                  <Route path="/promo" element={<Promo />} />

                  <Route
                    path="/pembayaran"
                    element={
                      <ProtectedRoute roles={['admin']}>
                        <PaymentSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pengguna"
                    element={
                      <ProtectedRoute superOnly>
                        <Pengguna />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pengaturan"
                    element={
                      <ProtectedRoute superOnly>
                        <PengaturanToko />
                      </ProtectedRoute>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </StoreProvider>
    </AuthProvider>
  )
}
