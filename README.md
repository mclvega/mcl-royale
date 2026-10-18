# McL Royale

Battle royale en 3D para el navegador, **sin construcción**. Diez jugadores (tú y 9 bots) saltan de un autobús volador sobre una isla, buscan armas y curas, y gana el último que quede en pie mientras la tormenta cierra el círculo.

- **Niveles infinitos**: cada nivel es una isla nueva generada con semilla (pueblos, granjas y almacenes con nombre, bosque y rocas). Para pasar de nivel hay que quedar entre los 3 primeros; los bots apuntan mejor y la tormenta va más rápida en cada nivel.
- **Botín por rareza** (común → legendaria): pistola, subfusil, fusil de asalto, escopeta y francotirador; vendas, botiquín y escudos. Cofres con mejor botín. 5 ranuras más el pico.
- **Vida y escudo**: el daño gasta primero el escudo; la tormenta quita vida directamente.
- **Bots** con personalidad (agresivos, equilibrados y camperos): eligen dónde saltar, saquean, se curan, huyen de la tormenta y buscan caminos con A* (entran en las casas por la puerta).
- Cámara en tercera persona sobre el hombro; mira telescópica con el francotirador.
- Controles de teclado y ratón, mando y táctiles (joystick, botón de disparo con mira deslizando hacia arriba, ayuda de apuntado y disparo automático opcional).
- Funciona sin conexión (PWA instalable) y el progreso queda solo en el navegador.

Publicado en https://mcl-royale.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # servidor local (?demo empieza una partida directamente)
npm test         # vitest
npm run build    # tsc --noEmit && vite build
```

Estructura: `src/core/*` es la lógica pura y testeable (física con rejilla espacial, isla, navegación A*, tormenta, botín, inventario, dificultad), `src/game/logica.ts` es la partida, `src/game/ia.ts` los bots y `src/game/render3d.ts` el dibujo con three.js.
