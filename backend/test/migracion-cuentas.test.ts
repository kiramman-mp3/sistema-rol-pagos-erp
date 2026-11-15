import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { abrirBase, consultar, ejecutar, migrar, uno, versionEsquema } from "../src/db.ts";
import type { Base } from "../src/db.ts";

const cuenta = async (db: Base, sql: string, ...params: (string | number)[]) =>
  Number((await uno(db, sql, ...params))?.n ?? 0);

describe("migración 013 con la base vacía", () => {
  let db: Base;
  before(async () => {
    db = await abrirBase(":memory:", { hasta: 12 });
    await migrar(db, 13);
  });
  after(() => db.cerrar());

  it("crea solo la plantilla, con las reglas y el orgánico que ya había", async () => {
    assert.equal(await versionEsquema(db), 13);
    const cuentas = await consultar(db, "SELECT id, plantilla FROM cuentas");
    assert.deepEqual(cuentas.map((c) => ({ ...c })), [{ id: 1, plantilla: true }]);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM regimenes WHERE cuenta_id = 1"), 3);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM puestos WHERE cuenta_id = 1"), 5);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM escala_salarial WHERE cuenta_id = 1"), 33);
  });

  it("copiar_plantilla da a otra cuenta sus propias copias, bien enlazadas", async () => {
    await ejecutar(db, "INSERT INTO cuentas (nombre, ruc) VALUES ('Otra', '')");
    await ejecutar(db, "SELECT copiar_plantilla(2)");
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM regimenes WHERE cuenta_id = 2"), 3);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM parametros_anuales WHERE cuenta_id = 2"), 1);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM escala_salarial WHERE cuenta_id = 2"), 33);
    const puestos = await consultar(
      db,
      `SELECT p.nombre, s.nombre AS superior, e.regimen, e.grado, e.cuenta_id AS cuenta_escala
       FROM puestos p LEFT JOIN puestos s ON s.id = p.superior_id JOIN escala_salarial e ON e.id = p.escala_id
       WHERE p.cuenta_id = 2 ORDER BY p.id`,
    );
    assert.equal(puestos.length, 5);
    assert.equal(puestos[0].nombre, "Gerente / Propietario");
    assert.equal(puestos[0].superior, null);
    assert.equal(puestos[1].superior, "Gerente / Propietario");
    assert.equal(puestos[4].nombre, "Auxiliar de guardalmacén");
    assert.deepEqual([puestos[4].regimen, puestos[4].grado], ["CODIGO_TRABAJO", 11]);
    // ningún puesto de la copia apunta a la plantilla ni a otra cuenta
    for (const p of puestos) assert.equal(p.cuenta_escala, 2);
    assert.equal(await cuenta(
      db, "SELECT COUNT(*) AS n FROM puestos p JOIN puestos s ON s.id = p.superior_id WHERE p.cuenta_id = 2 AND s.cuenta_id <> 2",
    ), 0);
  });

  it("un puesto no se puede repetir dentro de una cuenta", async () => {
    await assert.rejects(ejecutar(db, "INSERT INTO puestos (cuenta_id, nombre, funcion, responsabilidad, sector) VALUES (2, 'Gerente / Propietario', 'f', 'r', 's')"));
  });
});

describe("migración 013 con datos de una empresa anterior", () => {
  let db: Base;
  before(async () => {
    db = await abrirBase(":memory:", { hasta: 12 });
    await ejecutar(
      db,
      `INSERT INTO empleados (cedula, nombres, cargo, sueldo_base, fecha_ingreso, tipo_contrato, regimen, escala_id, puesto_id)
       VALUES ('1801234566', 'Ana', 'Auxiliar', 500, '2024-01-10', 'Indefinido', 'CODIGO_TRABAJO',
               (SELECT id FROM escala_salarial WHERE regimen = 'CODIGO_TRABAJO' AND grado = 11), 5)`,
    );
    await ejecutar(db, "UPDATE puestos SET responsable_id = 1 WHERE id = 5");
    await ejecutar(
      db,
      `INSERT INTO roles_cabecera (anio, mes, generado_en, num_empleados, total_ingresos, total_descuentos,
       total_neto, total_provisiones, total_costo) VALUES (2026, 9, '2026-10-01T00:00:00', 1, 500, 47, 453, 90, 590)`,
    );
    await migrar(db, 13);
  });
  after(() => db.cerrar());

  it("los datos pasan a la cuenta «Empresa anterior», que no tiene usuarios", async () => {
    const heredada = await uno(db, "SELECT id, nombre FROM cuentas WHERE NOT plantilla");
    assert.equal(heredada?.nombre, "Empresa anterior");
    const id = Number(heredada?.id);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM empleados WHERE cuenta_id = ?", id), 1);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM roles_cabecera WHERE cuenta_id = ?", id), 1);
    assert.equal(await cuenta(db, "SELECT COUNT(*) AS n FROM usuarios"), 0);
  });

  it("el empleado queda enlazado al puesto y al grado de su propia cuenta, no de la plantilla", async () => {
    const e = await uno(
      db,
      `SELECT p.nombre AS puesto, p.cuenta_id AS cuenta_puesto, g.grado, g.cuenta_id AS cuenta_grado, e.cuenta_id
       FROM empleados e JOIN puestos p ON p.id = e.puesto_id JOIN escala_salarial g ON g.id = e.escala_id`,
    );
    assert.equal(e?.puesto, "Auxiliar de guardalmacén");
    assert.equal(e?.grado, 11);
    assert.equal(e?.cuenta_puesto, e?.cuenta_id);
    assert.equal(e?.cuenta_grado, e?.cuenta_id);
  });

  it("el responsable sigue en su puesto, ahora el de la cuenta; la plantilla no tiene responsables", async () => {
    const r = await consultar(db, "SELECT cuenta_id, responsable_id FROM puestos WHERE responsable_id IS NOT NULL");
    assert.equal(r.length, 1);
    assert.notEqual(r[0].cuenta_id, 1);
  });
});
