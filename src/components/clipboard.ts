/**
 * Salin teks ke clipboard. Clipboard API hanya tersedia di secure context (HTTPS/localhost);
 * di HTTP LAN dipakai fallback seleksi teks. Elemen bantu ditaruh di dalam `container`
 * karena konten di luar dialog modal bersifat inert.
 */
export async function copyText(text: string, container: HTMLElement): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Lanjut ke fallback.
    }
  }
  const helper = document.createElement('textarea')
  helper.value = text
  helper.setAttribute('readonly', '')
  helper.setAttribute('aria-hidden', 'true')
  helper.style.position = 'fixed'
  helper.style.top = '0'
  helper.style.left = '0'
  helper.style.opacity = '0'
  container.appendChild(helper)
  try {
    helper.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    helper.remove()
  }
}
