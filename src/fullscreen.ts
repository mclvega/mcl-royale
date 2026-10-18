type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FsDoc;
const raiz = document.documentElement as FsEl;

/** El iPhone no permite pantalla completa en páginas (sí al añadir la web a la pantalla de inicio). */
export const pantallaCompletaDisponible = () => !!(raiz.requestFullscreen || raiz.webkitRequestFullscreen);
export const enPantallaCompleta = () => !!(document.fullscreenElement || doc.webkitFullscreenElement);

/** Si el jugador sale a mano (Esc), no se vuelve a forzar hasta que lo pida. */
let descartada = false;

export function entrarPantallaCompleta(): void {
  descartada = false;
  if (enPantallaCompleta() || !pantallaCompletaDisponible()) return;
  try {
    const p = raiz.requestFullscreen ? raiz.requestFullscreen({ navigationUI: 'hide' }) : raiz.webkitRequestFullscreen?.();
    p?.catch(() => undefined);
  } catch {
    // Sin gesto del usuario: se reintenta en el siguiente toque.
  }
}

export function salirPantallaCompleta(): void {
  if (!enPantallaCompleta()) return;
  descartada = true;
  const p = document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.();
  p?.catch(() => undefined);
}

/**
 * Los navegadores exigen un gesto para entrar en pantalla completa: con la opción activada,
 * el primer toque o tecla (p. ej. tras recargar la página) la activa.
 */
export function iniciarPantallaCompleta(activa: () => boolean): void {
  const auto = () => {
    if (activa() && !descartada && !enPantallaCompleta()) entrarPantallaCompleta();
  };
  window.addEventListener('pointerup', auto);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') auto();
  });
  const alCambiar = () => {
    if (!enPantallaCompleta()) descartada = true;
  };
  document.addEventListener('fullscreenchange', alCambiar);
  document.addEventListener('webkitfullscreenchange', alCambiar);
}
