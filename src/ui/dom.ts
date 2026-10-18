import { audio } from '../audio';

type Atributos = Record<string, string | boolean | number | ((ev: Event) => void) | undefined>;

/** Crea un elemento con atributos (`text`, `class`, `on*`) e hijos. */
export function h<K extends keyof HTMLElementTagNameMap>(
  etiqueta: K,
  atributos: Atributos = {},
  ...hijos: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false) continue;
    if (clave === 'text') el.textContent = String(valor);
    else if (clave.startsWith('on') && typeof valor === 'function') el.addEventListener(clave.slice(2), valor);
    else el.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos) if (hijo) el.append(hijo);
  return el;
}

export function boton(texto: string, alPulsar: () => void, opciones: { variante?: 'primario' | 'secundario' | 'suave'; icono?: string } = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      class: `btn btn-${opciones.variante ?? 'secundario'}`,
      onclick: () => {
        audio.efecto('boton');
        alPulsar();
      },
    },
    opciones.icono ? h('span', { class: 'btn-icono', 'aria-hidden': 'true', text: opciones.icono }) : null,
    h('span', { class: 'btn-texto', text: texto }),
  );
}

/** Muestra un panel sobre el juego; `null` lo oculta. */
export function mostrarPanel(contenido: HTMLElement | null): void {
  const ui = document.getElementById('ui')!;
  ui.replaceChildren();
  if (contenido) ui.append(h('div', { class: 'capa' }, contenido));
}
