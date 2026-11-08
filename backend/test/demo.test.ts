import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { registrarCuenta } from "../src/cuentas.ts";
import { abrirBase, consultar } from "../src/db.ts";
import { cargarEmpleadosDemo, generarRolesDemo } from "../src/demo.ts";
import { REGISTRO } from "./ayuda.ts";

describe("seed de ejemplo", () => {
  it("carga los empleados una sola vez y genera los roles de enero a septiembre", async () => {
    const db = await abrirBase(":memory:");
    try {
      const { cuentaId } = await registrarCuenta(db, REGISTRO);
      assert.equal(await cargarEmpleadosDemo(db, cuentaId), 12);
      assert.equal(await cargarEmpleadosDemo(db, cuentaId), 0);
      assert.equal(await generarRolesDemo(db, cuentaId), 9);

      const roles = await consultar(db, "SELECT anio, mes, num_empleados FROM roles_cabecera ORDER BY mes");
      assert.deepEqual(roles.map((r) => r.mes), [1, 2, 3, 4, 5, 6, 7, 8, 9]); // sin octubre
      assert.ok(roles.every((r) => r.anio === 2026));
      // Mayra ingresó en marzo y Pedro en octubre: solo aparecen cuando ya trabajaban
      assert.deepEqual(roles.map((r) => r.num_empleados), [10, 10, 11, 11, 11, 11, 11, 11, 11]);
    } finally {
      await db.cerrar();
    }
  });

  it("los roles de ejemplo recorren el ciclo: enero a agosto pagados y septiembre publicado", async () => {
    const db = await abrirBase(":memory:");
    try {
      const { cuentaId } = await registrarCuenta(db, REGISTRO);
      await cargarEmpleadosDemo(db, cuentaId);
      await generarRolesDemo(db, cuentaId);
      const estados = await consultar(db, "SELECT mes, estado FROM roles_cabecera ORDER BY mes");
      assert.deepEqual(estados.map((r) => r.estado), [...Array(8).fill("pagado"), "publicado"]);
      // Cada paso quedó en la auditoría como hecho por el sistema.
      const [enero] = await consultar(db, "SELECT id FROM roles_cabecera WHERE mes = 1");
      const pasos = await consultar(db, "SELECT accion, usuario_id FROM audit_logs WHERE entidad_id = ? ORDER BY id", Number(enero.id));
      assert.deepEqual(pasos.map((p) => p.accion), ["rol.calculado", "rol.validado", "rol.aprobado", "rol.publicado", "rol.pagado"]);
      assert.ok(pasos.every((p) => p.usuario_id === null));
    } finally {
      await db.cerrar();
    }
  });

  it("los roles de ejemplo traen horas extras y un neto positivo para cada empleado", async () => {
    const db = await abrirBase(":memory:");
    try {
      const { cuentaId } = await registrarCuenta(db, REGISTRO);
      await cargarEmpleadosDemo(db, cuentaId);
      await generarRolesDemo(db, cuentaId);
      const detalle = await consultar(db, "SELECT neto_pagar, valor_horas_suplementarias FROM roles_detalle");
      assert.ok(detalle.every((d) => Number(d.neto_pagar) > 0));
      assert.ok(detalle.some((d) => Number(d.valor_horas_suplementarias) > 0));
    } finally {
      await db.cerrar();
    }
  });
});
