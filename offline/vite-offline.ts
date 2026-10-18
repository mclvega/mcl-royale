import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Plugin de Vite: tras el build escribe `dist/sw.js` desde la plantilla `herramientas/sw.js`,
 * con la lista de TODOS los archivos de `dist` para guardarlos en caché al instalar la app.
 * La versión es un hash del contenido: cada build nuevo actualiza la caché del jugador.
 */
export function offline(nombre: string): Plugin {
  let salida = 'dist';
  return {
    name: 'mcl-offline',
    apply: 'build',
    configResolved(c) {
      salida = c.build.outDir;
    },
    closeBundle() {
      const archivos: string[] = [];
      const recorrer = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const ruta = join(dir, f);
          if (statSync(ruta).isDirectory()) recorrer(ruta);
          else archivos.push(ruta);
        }
      };
      recorrer(salida);
      const publicos = archivos
        .map((f) => '/' + relative(salida, f).split(sep).join('/'))
        .filter((f) => f !== '/sw.js' && !f.endsWith('.map') && f !== '/_headers' && f !== '/_redirects');
      const hash = createHash('sha256');
      for (const f of publicos.sort()) hash.update(f).update(readFileSync(join(salida, f)));
      const plantilla = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
      const sw = plantilla
        .replace('__NOMBRE__', nombre)
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__ARCHIVOS__', JSON.stringify(['/', ...publicos.filter((f) => f !== '/index.html'), '/index.html']));
      writeFileSync(join(salida, 'sw.js'), sw);
    },
  };
}
