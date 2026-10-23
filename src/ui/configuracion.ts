import { app } from '../app';
import { audio } from '../audio';
import { DIFICULTADES, MODOS } from '../core/difficulty';
import { CALIDADES, LIMITES_FPS } from '../rendimiento';
import { configPorDefecto, type Configuracion } from '../settings';
import { guardadoNuevo, limpiarNombre } from '../storage';
import { boton, h } from './dom';
import { opcionesSinConexion } from './sinconexion';

declare const __VERSION__: string;

type Clave = keyof Configuracion;

function cambiar<K extends Clave>(clave: K, valor: Configuracion[K]): void {
  if (clave === 'pantallaCompleta') app.cambiarPantallaCompleta(valor as boolean);
  app.g.config[clave] = valor;
  app.guardar();
  app.aplicarConfig();
}

function opcion(etiqueta: string, control: HTMLElement, ayuda?: string): HTMLElement {
  return h('div', { class: 'opcion-config' }, h('span', { class: 'etiqueta', text: etiqueta }), control, ayuda ? h('p', { class: 'ayuda-texto', text: ayuda }) : null);
}

/** Grupo de botones donde solo uno está elegido. */
function segmentado<K extends Clave>(clave: K, valores: Array<[Configuracion[K], string]>, etiqueta: string): HTMLElement {
  const grupo = h('div', { class: 'segmentado', role: 'group', 'aria-label': etiqueta });
  const pintar = () =>
    grupo.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => b.setAttribute('aria-pressed', String(app.g.config[clave] === valores[i][0])));
  for (const [valor, texto] of valores) {
    grupo.append(boton(texto, () => {
      cambiar(clave, valor);
      pintar();
    }));
  }
  pintar();
  return grupo;
}

type ClaveSiNo = { [K in Clave]: Configuracion[K] extends boolean ? K : never }[Clave];
const siNo = (clave: ClaveSiNo, etiqueta: string) => segmentado<ClaveSiNo>(clave, [[true, 'Sí'], [false, 'No']], etiqueta);

function deslizador(clave: 'volumenGeneral' | 'volumenEfectos' | 'sensibilidad', etiqueta: string, unidad = ' %', paso = '5', min = '0', max = '100'): HTMLElement {
  const salida = h('output', { text: `${app.g.config[clave]}${unidad}` });
  const entrada = h('input', {
    type: 'range', min, max, step: paso, value: String(app.g.config[clave]), 'aria-label': etiqueta,
    oninput: (ev: Event) => {
      const v = Number((ev.target as HTMLInputElement).value);
      salida.textContent = `${v}${unidad}`;
      cambiar(clave, v);
    },
    onchange: () => audio.efecto('recoger'),
  });
  return h('div', { class: 'deslizador' }, entrada, salida);
}

const seccion = (titulo: string, ...hijos: HTMLElement[]) => h('section', { class: 'seccion-config' }, h('h2', { text: titulo }), ...hijos);

/** Panel de configuración común a todos los juegos (ver CLAUDE.md). */
export function panelConfiguracion(opciones: { enJuego?: boolean; alReiniciar: () => void }): HTMLElement {
  const raiz = h('div', { class: 'pila' });

  const entradaNombre = h('input', { id: 'cfg-nombre', type: 'text', maxlength: '20', value: app.g.nombre ?? '' }) as HTMLInputElement;
  const errorNombre = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  raiz.append(
    seccion(
      '🙂 Jugador',
      h('label', { for: 'cfg-nombre', class: 'etiqueta', text: 'Tu nombre' }),
      entradaNombre,
      errorNombre,
      boton('Guardar nombre', () => {
        const nombre = limpiarNombre(entradaNombre.value);
        errorNombre.textContent = nombre ? '¡Guardado!' : 'Escribe tu nombre (hasta 20 caracteres).';
        if (!nombre) return;
        app.g.nombre = nombre;
        app.guardar();
      }, { variante: 'primario', icono: '💾' }),
    ),
    seccion(
      '🎯 Juego',
      opcion('Dificultad', segmentado('dificultad', DIFICULTADES.map((d) => [d, MODOS[d].nombre]), 'Dificultad'), 'El cambio se aplica en la siguiente partida.'),
      opcion('Sensibilidad de la cámara', deslizador('sensibilidad', 'Sensibilidad de la cámara', '', '1', '1', '10')),
      opcion('Apuntado asistido', siNo('apuntadoAsistido', 'Apuntado asistido'), 'En pantallas táctiles, la mira se acerca sola al enemigo más cercano.'),
      opcion('Disparo automático', siNo('disparoAutomatico', 'Disparo automático'), 'En pantallas táctiles, dispara solo cuando la mira está sobre un enemigo (como el modo simple de los shooters móviles).'),
      opcion('Nombres del botín', siNo('marcadoresBotin', 'Nombres del botín'), 'Muestra el nombre y la rareza de los objetos cercanos.'),
      opcion('Cámara', segmentado('camara', [['tercera', 'Normal'], ['cerca', 'Cercana']], 'Cámara'), 'Distancia de la cámara detrás del personaje.'),
    ),
    seccion('🔊 Sonido', opcion('Volumen', deslizador('volumenGeneral', 'Volumen general')), opcion('Efectos', deslizador('volumenEfectos', 'Volumen de los efectos'))),
    seccion(
      '👓 Pantalla',
      opcion('Tema', segmentado('tema', [['claro', 'Claro'], ['oscuro', 'Oscuro']], 'Tema')),
      opcion('Tamaño del texto', segmentado('tamanoTexto', [['normal', 'Normal'], ['grande', 'Grande'], ['muyGrande', 'Muy grande']], 'Tamaño del texto')),
      opcion('Animaciones', segmentado('animacionesReducidas', [[false, 'Completas'], [true, 'Reducidas']], 'Animaciones'), 'Con «Reducidas» hay menos efectos (olas, hojas y destellos).'),
      opcion('Pantalla completa', siNo('pantallaCompleta', 'Pantalla completa'), 'Se activa al tocar la pantalla.'),
      opcion('Calidad', segmentado('calidad', CALIDADES, 'Calidad'), '«Auto» baja la resolución si el juego va lento. «Baja» quita las sombras.'),
      opcion('Límite de FPS', segmentado('limiteFps', LIMITES_FPS, 'Límite de FPS'), 'A 30 FPS se gasta menos batería.'),
      opcion('Mostrar FPS', siNo('mostrarFps', 'Mostrar FPS')),
    ),
  );

  if (!opciones.enJuego) {
    raiz.append(
      seccion(
        '💾 Mis datos',
        opcionesSinConexion(),
        boton('Restaurar valores recomendados', () => {
          app.g.config = configPorDefecto();
          app.guardar();
          app.aplicarConfig();
          opciones.alReiniciar();
        }, { icono: '↺', variante: 'suave' }),
        boton('Reiniciar todo el progreso', () => {
          if (!confirm('Se borrarán tus récords, tu nivel y tus estadísticas. Esta acción no se puede deshacer. ¿Seguro?')) return;
          app.g = guardadoNuevo();
          app.guardar();
          app.aplicarConfig();
          opciones.alReiniciar();
        }, { icono: '🗑️', variante: 'suave' }),
      ),
    );
  }
  raiz.append(h('p', { class: 'texto-suave', text: `McL Royale · versión ${__VERSION__}` }));
  return raiz;
}
