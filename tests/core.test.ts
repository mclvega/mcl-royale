import { describe, expect, it } from 'vitest';
import { stats } from '../src/core/armas';
import { botinDe, rarezaAlAzar } from '../src/core/botin';
import { MODOS, modoNivel } from '../src/core/difficulty';
import { moverCuerpo, rayoCaja, rayoMapa, Rejilla, seVen, type Cuerpo } from '../src/core/fisica';
import { aplicarCura, aplicarDano, armaNueva, inventarioVacio, mejorCura, recoger, vaciar } from '../src/core/inventario';
import { generarIsla } from '../src/core/isla';
import { PASO } from '../src/core/loop';
import { crearRng } from '../src/core/rng';
import { actualizarTormenta, crearTormenta, FASES, fuera } from '../src/core/tormenta';
import { controlesVacios, JUGADORES, Partida, type Resumen } from '../src/game/logica';
import { normalizarConfig } from '../src/settings';
import { anotarPartida, guardadoNuevo, normalizarGuardado } from '../src/storage';

const cuerpo = (x: number, z: number): Cuerpo => ({ x, y: 0, z, vy: 0, radio: 0.35, alto: 1.8, enSuelo: true });

describe('isla', () => {
  it('es la misma con la misma semilla y distinta con otra', () => {
    const a = generarIsla(5);
    expect(generarIsla(5).bloques.length).toBe(a.bloques.length);
    expect(generarIsla(6).lugares[0].nombre + generarIsla(6).bloques.length).not.toBe(a.lugares[0].nombre + a.bloques.length);
  });

  it('tiene lugares, casas, árboles y botín dentro de la isla', () => {
    for (let s = 1; s < 8; s++) {
      const isla = generarIsla(s);
      expect(isla.lugares.length).toBeGreaterThanOrEqual(5);
      expect(isla.casas.length).toBeGreaterThan(8);
      expect(isla.arboles.length).toBeGreaterThan(80);
      expect(isla.botin.filter((b) => b.cofre).length).toBeGreaterThan(5);
      for (const b of isla.bloques) expect(Math.hypot(b.x, b.z)).toBeLessThan(isla.radio + 5);
    }
  });

  it('se entra en las casas por la puerta', () => {
    const isla = generarIsla(3);
    const rejilla = new Rejilla(isla.bloques);
    const casa = isla.casas[0];
    const c = cuerpo(casa.fuera.x, casa.fuera.z);
    for (let i = 0; i < 120; i++) {
      const dx = casa.x - c.x;
      const dz = casa.z - c.z;
      const l = Math.hypot(dx, dz) || 1;
      moverCuerpo(c, (dx / l) * 0.06, (dz / l) * 0.06, PASO, rejilla);
    }
    expect(Math.hypot(c.x - casa.x, c.z - casa.z)).toBeLessThan(1);
    // El techo tapa la vista desde arriba.
    expect(seVen({ x: casa.x, y: 1.5, z: casa.z }, { x: casa.x, y: 20, z: casa.z }, rejilla)).toBe(false);
  });

  it('rayos contra cajas y bloques', () => {
    expect(rayoCaja(0, 0.5, -5, 0, 0, 1, -1, 0, -1, 1, 1, 1)).toBeCloseTo(4);
    expect(rayoCaja(5, 0.5, -5, 0, 0, 1, -1, 0, -1, 1, 1, 1)).toBe(Infinity);
    const rejilla = new Rejilla([{ tipo: 'roca', x: 30, z: 0, w: 2, d: 2, y0: 0, y1: 2, estilo: 0 }]);
    expect(rayoMapa(0, 1, 0, 1, 0, 0, rejilla, 100)).toBeCloseTo(29);
    expect(rayoMapa(0, 1, 5, 1, 0, 0, rejilla, 100)).toBe(100);
  });
});

describe('tormenta', () => {
  it('se cierra fase a fase y cada círculo queda dentro del anterior', () => {
    const rng = crearRng(4);
    const t = crearTormenta(rng, 100);
    let anterior = { ...t.actual };
    let fase = 0;
    for (let i = 0; i < 60 * 600 && t.fase < FASES.length; i++) {
      actualizarTormenta(t, PASO, rng, 100);
      if (t.fase !== fase) {
        expect(Math.hypot(t.actual.x - anterior.x, t.actual.z - anterior.z) + t.actual.r).toBeLessThanOrEqual(anterior.r + 1e-6);
        anterior = { ...t.actual };
        fase = t.fase;
      }
    }
    expect(t.fase).toBe(FASES.length);
    expect(t.actual.r).toBe(0);
    expect(fuera(t, 50, 50)).toBe(true);
  });
});

describe('inventario y daño', () => {
  it('el escudo para el daño y la tormenta no', () => {
    const s = { vida: 100, escudo: 50 };
    aplicarDano(s, 70);
    expect(s).toEqual({ vida: 80, escudo: 0 });
    s.escudo = 30;
    aplicarDano(s, 10, true);
    expect(s).toEqual({ vida: 70, escudo: 30 });
  });

  it('curas con sus límites', () => {
    const s = { vida: 70, escudo: 40 };
    aplicarCura(s, 'vendas');
    expect(s.vida).toBe(75);
    aplicarCura(s, 'escudoP');
    expect(s.escudo).toBe(50);
    aplicarCura(s, 'escudoG');
    expect(s.escudo).toBe(100);
    aplicarCura(s, 'botiquin');
    expect(s.vida).toBe(100);
  });

  it('recoger apila, llena ranuras y cambia la elegida', () => {
    const inv = inventarioVacio();
    expect(recoger(inv, { tipo: 'municion', municion: 'media', cantidad: 20 })).toBeNull();
    expect(inv.municion.media).toBe(20);
    recoger(inv, armaNueva('fusil', 2));
    expect(inv.seleccion).toBe(0);
    recoger(inv, { tipo: 'cura', cura: 'vendas', cantidad: 10 });
    recoger(inv, { tipo: 'cura', cura: 'vendas', cantidad: 10 });
    expect(inv.ranuras.filter((r) => r?.tipo === 'cura').map((r) => (r as { cantidad: number }).cantidad)).toEqual([15, 5]);
    recoger(inv, armaNueva('pistola', 0));
    recoger(inv, armaNueva('escopeta', 1));
    const soltada = recoger(inv, armaNueva('francotirador', 4));
    expect(soltada?.tipo).toBe('arma');
    expect(inv.ranuras[0]).toMatchObject({ arma: 'francotirador' });
    expect(mejorCura(inv, { vida: 40, escudo: 0 })).toBeGreaterThan(-1);
    expect(vaciar(inv).length).toBe(6);
  });

  it('la rareza mejora el arma y los cofres dan mejor botín', () => {
    expect(stats('fusil', 4).dano).toBeGreaterThan(stats('fusil', 0).dano);
    const rng = crearRng(1);
    let suelo = 0;
    let cofre = 0;
    for (let i = 0; i < 2000; i++) {
      suelo += rarezaAlAzar(rng, false);
      cofre += rarezaAlAzar(rng, true);
    }
    expect(cofre).toBeGreaterThan(suelo);
    for (let i = 0; i < 50; i++) expect(botinDe(rng, true).some((o) => o.tipo === 'arma')).toBe(true);
  });

  it('la dificultad sube con el nivel', () => {
    expect(modoNivel(MODOS.normal, 20).punteria).toBeGreaterThan(MODOS.normal.punteria);
    expect(modoNivel(MODOS.normal, 1)).toEqual(MODOS.normal);
  });
});

describe('partida', () => {
  it('10 jugadores en el autobús; el jugador salta y aterriza', () => {
    const p = new Partida(MODOS.normal, 1, { fin: () => undefined }, 7);
    expect(p.luchadores).toHaveLength(JUGADORES);
    expect(p.enBus).toBe(true);
    for (let i = 0; i < 120; i++) p.actualizar(PASO, controlesVacios());
    p.actualizar(PASO, { ...controlesVacios(), saltar: true });
    expect(p.jugador.estado).toBe('cayendo');
    for (let i = 0; i < 60 * 20 && p.jugador.estado !== 'suelo'; i++) p.actualizar(PASO, controlesVacios());
    expect(p.jugador.estado).toBe('suelo');
  });

  it('una partida entera termina con un solo ganador', () => {
    for (const semilla of [11, 12]) {
      let resumen: Resumen | null = null;
      const p = new Partida(modoNivel(MODOS.desafio, 5), 5, { fin: (r) => (resumen = r) }, semilla);
      for (let i = 0; i < 60 * 60 * 9 && !p.ganador; i++) p.actualizar(PASO, controlesVacios());
      expect(p.ganador).not.toBeNull();
      expect(p.vivos).toBe(1);
      expect(resumen).not.toBeNull();
      const puestos = p.luchadores.map((l) => l.puesto).sort((a, b) => a - b);
      expect(puestos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // Los bots recogen armas y se eliminan entre ellos, no solo por la tormenta.
      expect(p.luchadores.reduce((s, l) => s + l.bajas, 0)).toBeGreaterThan(0);
    }
  });

  it('abrir un cofre y recoger un arma', () => {
    const p = new Partida(MODOS.normal, 1, { fin: () => undefined }, 3);
    const j = p.jugador;
    const cofre = p.cofres[0];
    j.estado = 'suelo';
    Object.assign(j.cuerpo, { x: cofre.x + 0.5, y: cofre.y, z: cofre.z, enSuelo: true });
    p.abrirCofre(j, cofre);
    const arma = p.objetos.find((o) => o.objeto.tipo === 'arma' && Math.hypot(o.x - cofre.x, o.z - cofre.z) < 2)!;
    p.recogerObjeto(j, arma);
    expect(j.inv.ranuras.some((r) => r?.tipo === 'arma')).toBe(true);
    expect(p.arma(j)?.tipo).toBe('arma');
  });
});

describe('guardado', () => {
  it('normaliza y anota partidas con paso de nivel en el Top 3', () => {
    const g = normalizarGuardado({ nivel: 4, records: [{ nombre: 'a', nivel: 2, puesto: 5, bajas: 9, fecha: 'x' }, { nombre: 'b', nivel: 1, puesto: 1, bajas: 1, fecha: 'x' }], look: { gender: 'alien' } });
    expect(g.records.map((r) => r.nombre)).toEqual(['b', 'a']);
    expect(g.look.gender).toBe('boy');
    expect(g.nivel).toBe(4);
    expect(anotarPartida(g, { puesto: 3, bajas: 2 }, 'c', 3).subeNivel).toBe(true);
    expect(g.nivel).toBe(5);
    expect(anotarPartida(g, { puesto: 4, bajas: 0 }, 'c', 3).subeNivel).toBe(false);
    expect(g.estadisticas.partidas).toBe(2);
    expect(guardadoNuevo().nivel).toBe(1);
    expect(normalizarConfig({ sensibilidad: 99 }).sensibilidad).toBe(10);
    expect(normalizarConfig({}).pantallaCompleta).toBe(true);
  });
});
