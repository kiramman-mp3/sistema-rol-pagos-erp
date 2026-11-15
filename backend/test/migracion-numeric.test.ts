import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { abrirBase, consultar, ejecutar, insertar, migrar, uno, versionEsquema } from "../src/db.ts";
import type { Base, Fila } from "../src/db.ts";

const TABLAS = [
  "empleados", "novedades", "roles_cabecera", "roles_detalle", "parametros_anuales", "escala_salarial", "regimenes",
] as const;

/**
 * Datos con cifras de coma flotante en el esquema de la versión 10: 12 empleados, nueve meses de roles
 * con un detalle por empleado y las novedades de cada mes. Los valores tienen decimales que un
 * DOUBLE no representa exacto (0.1, 1234.56…), que es lo que la migración debe conservar.
 */
async function cargarDatosAnteriores(db: Base) {
  for (let i = 1; i <= 12; i++) {
    await ejecutar(
      db,
      `INSERT INTO empleados (cedula, nombres, cargo, sueldo_base, fecha_ingreso, tipo_contrato)
       VALUES (?, ?, 'Cargo', ?, '2024-01-10', 'Indefinido')`,
      `18012345${String(i).padStart(2, "0")}`, `Empleado ${i}`, Number((482 + i * 37.37).toFixed(2)),
    );
  }
  const columnas = await consultar(
    db,
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_name = 'roles_detalle' AND column_default IS NULL AND column_name NOT IN ('id', 'rol_id')`,
  );
  for (let mes = 1; mes <= 9; mes++) {
    const rol = await insertar(
      db,
      `INSERT INTO roles_cabecera (anio, mes, generado_en, num_empleados, total_ingresos, total_descuentos,
       total_neto, total_provisiones, total_costo) VALUES (2026, ?, '2026-10-01T00:00:00', 12, ?, ?, ?, ?, ?)`,
      mes, ...[12345.67, 1234.56, 11111.11, 2222.22, 14567.89].map((v) => Number((v + mes).toFixed(2))),
    );
    for (let i = 1; i <= 12; i++) {
      const valor = (tipo: unknown, nombre: unknown) =>
        tipo === "double precision" ? `${(i * 10.1 + mes * 0.1).toFixed(2)}` :
        tipo === "integer" ? String(i) :
        nombre === "empleado_id" ? String(i) : nombre === "fecha_ingreso" ? "'2024-01-10'" : `'${nombre}'`;
      await ejecutar(
        db,
        `INSERT INTO roles_detalle (rol_id, ${columnas.map((c) => c.column_name).join(", ")})
         VALUES (${rol}, ${columnas.map((c) => valor(c.data_type, c.column_name)).join(", ")})`,
      );
      await ejecutar(
        db,
        `INSERT INTO novedades (empleado_id, anio, mes, horas_suplementarias, comisiones, otros_descuentos)
         VALUES (?, 2026, ?, ?, ?, ?)`,
        i, mes, Number((i * 0.7 + 0.1).toFixed(2)), Number((i * 12.34).toFixed(2)), Number((mes * 0.1).toFixed(2)),
      );
    }
  }
}

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
    await cargarDatosAnteriores(db);
    antes = await instantanea(db);
    await migrar(db, 11); // solo esta migración: las posteriores pueden cambiar datos a propósito
  });
  after(() => db.cerrar());

  it("hay datos de verdad que migrar", () => {
    assert.equal(antes.empleados.length, 12);
    assert.equal(antes.roles_cabecera.length, 9);
    assert.equal(antes.roles_detalle.length, 108);
    assert.equal(antes.novedades.length, 108);
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
