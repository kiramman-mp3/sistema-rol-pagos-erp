import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { generarRolesDemo, cargarEmpleadosDemo } from "../src/demo.ts";
import { abrirBase, consultar, ejecutar, migrar, uno, versionEsquema } from "../src/db.ts";
import type { Base, Fila } from "../src/db.ts";

const TABLAS = [
  "empleados", "novedades", "roles_cabecera", "roles_detalle", "parametros_anuales", "escala_salarial", "regimenes",
] as const;

/** Todas las filas de las tablas con cifras, ordenadas, para compararlas antes y después de migrar. */
async function instantanea(db: Base): Promise<Record<string, Fila[]>> {
  const resultado: Record<string, Fila[]> = {};
  for (const tabla of TABLAS) resultado[tabla] = await consultar(db, `SELECT * FROM ${tabla} ORDER BY 1, 2, 3`);
  return resultado;
}

describe("migración 011: dinero, tasas y horas pasan a NUMERIC", () => {
  let db: Base;
  let antes: Record<string, Fila[]>;

  before(async () => {
    db = await abrirBase(":memory:", { hasta: 10 });
    assert.equal(await versionEsquema(db), 10);
    await cargarEmpleadosDemo(db);
    await generarRolesDemo(db);
    antes = await instantanea(db);
    await migrar(db, 11); // solo esta migración: las posteriores pueden cambiar datos a propósito
  });
  after(() => db.cerrar());

  it("hay datos de verdad que migrar", () => {
    assert.equal(antes.empleados.length, 12);
    assert.equal(antes.roles_cabecera.length, 9);
    assert.ok(antes.roles_detalle.length > 90);
    assert.ok(antes.novedades.length > 50);
    assert.equal(antes.regimenes.length, 3);
  });

  it("deja la base en la versión 11", async () => {
    assert.equal(await versionEsquema(db), 11);
  });

  it("ninguna columna queda en coma flotante", async () => {
    const flotantes = await consultar(
      db,
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('double precision', 'real')",
    );
    assert.deepEqual(flotantes, []);
  });

  it("no cambia ningún valor: todas las cifras son las mismas", async () => {
    const despues = await instantanea(db);
    for (const tabla of TABLAS) {
      assert.equal(despues[tabla].length, antes[tabla].length, tabla);
      despues[tabla].forEach((fila, i) => assert.deepEqual(fila, antes[tabla][i], `${tabla} fila ${i}`));
    }
  });

  it("los tipos son los esperados", async () => {
    const tipo = async (tabla: string, columna: string) =>
      (await uno(
        db,
        "SELECT numeric_precision AS p, numeric_scale AS s FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
        tabla, columna,
      ))!;
    assert.deepEqual({ ...(await tipo("roles_detalle", "neto_pagar")) }, { p: 14, s: 2 });
    assert.deepEqual({ ...(await tipo("regimenes", "iess_personal")) }, { p: 8, s: 6 });
    assert.deepEqual({ ...(await tipo("novedades", "horas_suplementarias")) }, { p: 12, s: 4 });
    assert.deepEqual({ ...(await tipo("regimenes", "tope_suplementarias_mes")) }, { p: 8, s: 2 });
  });

  it("las sumas son exactas: 0.1 + 0.2 es 0.3", async () => {
    await ejecutar(db, "INSERT INTO novedades (empleado_id, anio, mes, comisiones) VALUES (1, 2030, 1, 0.1)");
    await ejecutar(db, "INSERT INTO novedades (empleado_id, anio, mes, comisiones) VALUES (2, 2030, 1, 0.2)");
    const r = await uno(db, "SELECT SUM(comisiones) = 0.3 AS exacta FROM novedades WHERE anio = 2030");
    assert.equal(r?.exacta, true);
  });

  it("migrar otra vez no hace nada", async () => {
    const antesDeRepetir = await instantanea(db);
    await migrar(db, 11);
    assert.deepEqual(await instantanea(db), antesDeRepetir);
  });
});
