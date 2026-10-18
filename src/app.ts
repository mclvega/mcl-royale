import { audio } from './audio';
import { entrarPantallaCompleta, salirPantallaCompleta } from './fullscreen';
import { aplicarConfigVisual } from './settings';
import { cargar, guardar, type Guardado } from './storage';

/** Estado compartido de la aplicación: guardado y aplicación de la configuración. */
export const app = {
  g: cargar() as Guardado,

  guardar() {
    guardar(this.g);
  },

  aplicarConfig() {
    const c = this.g.config;
    aplicarConfigVisual(c);
    audio.volumen = (c.volumenGeneral / 100) * (c.volumenEfectos / 100);
  },

  cambiarPantallaCompleta(activa: boolean) {
    this.g.config.pantallaCompleta = activa;
    this.guardar();
    (activa ? entrarPantallaCompleta : salirPantallaCompleta)();
  },

  nombre(): string {
    return this.g.nombre ?? 'Jugador';
  },
};
