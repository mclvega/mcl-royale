import { boton, h } from './dom';

/*
 * «Jugar sin conexión» en Configuración → Mis datos (se copia tal cual a `src/ui/sinconexion.ts`).
 * El service worker ya guarda todo el juego la primera vez; aquí se ve el estado,
 * se puede descargar o actualizar a mano y se ofrece instalar el juego como app.
 */

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let aviso: EventoInstalar | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    aviso = e as EventoInstalar;
  });
  window.addEventListener('appinstalled', () => (aviso = null));
}

/** ¿Se está usando como app instalada? (la pantalla completa del navegador no cuenta). */
const instalada = () => {
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  if (typeof matchMedia !== 'function') return false;
  if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches) return true;
  return matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement;
};
/** Los botones tienen `display` propio en el CSS: `hidden` no basta para ocultarlos. */
const ocultar = (el: HTMLElement) => (el.style.display = 'none');
const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Archivos guardados en la caché del juego (0 si no hay). */
async function archivosGuardados(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let total = 0;
  for (const nombre of await caches.keys()) total = Math.max(total, (await (await caches.open(nombre)).keys()).length);
  return total;
}

/** Espera a que el service worker quede activo (o se rinde a los 30 s). */
function esperarActivo(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (reg.active && !reg.installing && !reg.waiting) return Promise.resolve(true);
  return new Promise((resolver) => {
    const sw = reg.installing ?? reg.waiting;
    if (!sw) return resolver(!!reg.active);
    const fin = setTimeout(() => resolver(!!reg.active), 30000);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated' || sw.state === 'redundant') {
        clearTimeout(fin);
        resolver(sw.state === 'activated');
      }
    });
  });
}

/** Opciones de «Jugar sin conexión» e «Instalar como app» para la sección Mis datos. */
export function opcionesSinConexion(): HTMLElement {
  const estado = h('p', { class: 'ayuda-texto', 'aria-live': 'polite', text: 'Comprobando…' });
  const soportado = 'serviceWorker' in navigator && typeof caches !== 'undefined';

  const comprobar = async () => {
    if (!soportado) {
      estado.textContent = 'Tu navegador no permite guardar el juego para jugar sin conexión.';
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const n = await archivosGuardados();
    if (reg?.active && n > 0) estado.textContent = `✅ Descargado (${n} archivos): puedes jugar sin conexión. Tu progreso se guarda en este dispositivo.`;
    else if (reg?.installing) estado.textContent = '⏳ Descargando el juego…';
    else estado.textContent = 'Aún no está descargado. Pulsa «Descargar ahora» con conexión.';
  };

  const descargar = boton('Descargar ahora', async () => {
    if (!soportado) return;
    if (import.meta.env.DEV) {
      estado.textContent = 'En modo desarrollo no hay descarga: funciona en la versión publicada.';
      return;
    }
    if (!navigator.onLine) {
      estado.textContent = 'Necesitas conexión para descargar o actualizar el juego.';
      return;
    }
    descargar.disabled = true;
    estado.textContent = '⏳ Descargando el juego…';
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await reg.update();
      await esperarActivo(reg);
    } catch {
      estado.textContent = 'No se pudo descargar. Inténtalo de nuevo con conexión.';
      descargar.disabled = false;
      return;
    }
    descargar.disabled = false;
    await comprobar();
  }, { icono: '📥', variante: 'suave' });

  const instalar = boton('Instalar como app', async () => {
    if (aviso) {
      await aviso.prompt();
      const r = await aviso.userChoice;
      aviso = null;
      instalarTexto.textContent = r.outcome === 'accepted' ? '¡Instalado! Ábrelo desde tu pantalla de inicio.' : 'Puedes instalarlo cuando quieras.';
      ocultar(instalar);
    }
  }, { icono: '📲', variante: 'suave' });
  const instalarTexto = h('p', { class: 'ayuda-texto' });
  if (instalada()) {
    ocultar(instalar);
    instalarTexto.textContent = 'Ya lo tienes instalado como app.';
  } else if (!aviso) {
    ocultar(instalar);
    instalarTexto.textContent = esIos()
      ? 'Para instalarlo en iPhone o iPad: botón Compartir de Safari → «Añadir a pantalla de inicio».'
      : 'Para instalarlo: menú del navegador → «Instalar app» o «Añadir a pantalla de inicio».';
  }

  void comprobar();
  return h('div', { class: 'opcion-config' }, h('span', { class: 'etiqueta', text: '📥 Jugar sin conexión' }), estado, descargar, instalar, instalarTexto);
}
