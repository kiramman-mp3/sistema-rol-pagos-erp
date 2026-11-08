import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { cargarEmpleadosDemo } from "../src/demo.ts";
import { abrirBase, ejecutar } from "../src/db.ts";
import type { Base } from "../src/db.ts";
import { buscarPuesto, hayPuestosDelRegimen, listarPuestos } from "../src/puestos.ts";

/** La misma base, pero contando cuántas consultas se le hacen. */
function contando(db: Base): { base: Base; consultas: () => number } {
  let n = 0;
  return {
    base: { ...db, consultar: (sql, params) => (n++, db.consultar(sql, params)) },
    consultas: () => n,
  };
}

describe("consultas del orgánico", () => {
  let db: Base;
  before(async () => {
    db = await abrirBase(":memory:");
    await cargarEmpleadosDemo(db);
    await ejecutar(db, "UPDATE empleados SET activo = 0 WHERE cedula = ?", "1706789029");
  });
  after(() => db.cerrar());

  it("listar todos los puestos cuesta cuatro consultas, sin importar cuántos haya", async () => {
    const { base, consultas } = contando(db);
    const puestos = await listarPuestos(base);
    assert.ok(puestos.length >= 5);
    assert.equal(consultas(), 4);
  });

  it("cada puesto de la lista es idéntico al que devuelve buscarPuesto", async () => {
    for (const puesto of await listarPuestos(db)) {
      assert.deepEqual(await buscarPuesto(db, puesto.id), puesto, puesto.nombre);
    }
  });

  it("los ocupantes son solo los activos, pero el conteo incluye a los inactivos", async () => {
    const operaciones = (await listarPuestos(db)).find((p) => p.nombre === "Operaciones de instalaciones")!;
    assert.equal(operaciones.empleados, 3);
    assert.equal(operaciones.ocupantes.length, 2);
    assert.ok(!operaciones.ocupantes.some((o) => o.nombres === "Santiago Andrés Cevallos"));
    assert.equal(operaciones.responsable?.nombres, "Maybeline Navarro");
    assert.equal(operaciones.referencia?.regimen, "CODIGO_TRABAJO");
  });

  it("sabe si un régimen tiene puestos con una sola consulta", async () => {
    const { base, consultas } = contando(db);
    assert.equal(await hayPuestosDelRegimen(base, "CODIGO_TRABAJO"), true);
    assert.equal(await hayPuestosDelRegimen(base, "LOSEP"), false);
    assert.equal(consultas(), 2);
  });
});
