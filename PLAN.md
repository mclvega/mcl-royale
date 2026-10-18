# Plan: McL Royale (battle royale sin construcción)

## Qué es

Un battle royale de 10 jugadores en una isla pequeña (radio de 100 m): tú y 9 bots. No se construye: solo hay cobertura del terreno (casas con puertas y ventanas, rocas, árboles, cajas y vallas).

## Partida

1. **Autobús**: cruza la isla por una ruta al azar. Saltas cuando quieras; los bots eligen un lugar y saltan al pasar cerca.
2. **Caída libre y planeador**: se abre solo a 28 m (o antes con Espacio).
3. **Saqueo**: botín en el suelo y en cofres; la munición se recoge sola.
4. **Tormenta**: 5 fases (espera y cierre). Cada círculo nuevo queda dentro del anterior; fuera se pierde vida.
5. **Fin**: puesto, bajas, daño y tiempo. Top 3 = siguiente nivel. Si caes, puedes ver el resto de la partida.

## Reglas comunes (netlify/CLAUDE.md)

3D con three.js, avatares del Arcade (`characters.ts`), 4 dificultades (`MODOS` con puntería, reacción, daño, tormenta y botín), configuración común, pantalla completa, modo oscuro AMOLED, PWA sin conexión y `rendimiento.ts`.

## Ideas siguientes

- Dúos con un bot aliado.
- Vehículos y objetos de movilidad.
- Mapa grande a pantalla completa.
- Multijugador en línea con un servidor aparte.
