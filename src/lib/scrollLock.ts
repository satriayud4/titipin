// Kunci scroll halaman dengan penghitung: aman walau beberapa jendela dibuka dan ditutup bergantian
let locks = 0
let saved = ''

export function lockScroll() {
  if (locks === 0) {
    saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) document.body.style.overflow = saved
  }
}