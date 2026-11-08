import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { cargarEmpleadosDePrueba, EMPLEADO, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });
const CARLOS = 2; // Contador, ingresó el 2022-07-15, sueldo 1800

describe("fecha de salida", () => {
  let api: Cliente;
  const idsDelPeriodo = async (anio: number, mes: number): Promise<number[]> =>
    (await api.get(`/api/roles/periodo/${anio}/${mes}`)).json.empleados.map((e: { id: number }) => e.id);
  const carlos = async () => (await api.get(`/api/empleados/${CARLOS}`)).json;
  const editarCarlos = async (cambios: Record<string, unknown>) => {
    const { id, activo, avisos, fechaSalida, ...datos } = await carlos();
    void id; void activo; void avisos;
    return api.put(`/api/empleados/${CARLOS}`, { ...datos, fechaSalida, ...cambios });
  };

  before(async () => {
    api = await iniciar();
    await cargarEmpleadosDePrueba(api);
  });
  after(() => api.cerrar());

  describe("validación", () => {
    it("un empleado nuevo no tiene salida", async () => {
      assert.equal((await carlos()).fechaSalida, null);
    });

    it("rechaza una fecha inválida o anterior al ingreso", async () => {
      const mala = await api.post("/api/empleados", { ...EMPLEADO, fechaSalida: "2026-02-30" });
      assert.equal(mala.status, 400);
      assert.ok(mala.json.errores.includes("Fecha de salida inválida."));
      const antes = await api.post("/api/empleados", { ...EMPLEADO, fechaSalida: "2023-12-31" });
      assert.equal(antes.status, 400);
      assert.ok(antes.json.errores.includes("La fecha de salida no puede ser anterior a la de ingreso."));
    });

    it("guarda una fecha válida, incluso el mismo día del ingreso, y la puede quitar", async () => {
      const guardada = await editarCarlos({ fechaSalida: "2026-10-15" });
      assert.equal(guardada.status, 200);
      assert.equal(guardada.json.fechaSalida, "2026-10-15");
      assert.equal((await editarCarlos({ fechaSalida: "2022-07-15" })).json.fechaSalida, "2022-07-15");
      assert.equal((await editarCarlos({ fechaSalida: "" })).json.fechaSalida, null);
    });
  });

  describe("quién entra a cada rol", () => {
    before(async () => {
      assert.equal((await editarCarlos({ fechaSalida: "2026-10-15" })).status, 200);
    });

    it("entra hasta el mes de su salida y no después", async () => {
      assert.ok((await idsDelPeriodo(2026, 9)).includes(CARLOS));
      assert.ok((await idsDelPeriodo(2026, 10)).includes(CARLOS));
      assert.ok(!(await idsDelPeriodo(2026, 11)).includes(CARLOS));
      assert.ok(!(await idsDelPeriodo(2027, 1)).includes(CARLOS));
    });

    it("en el mes de salida se le paga solo hasta ese día", async () => {
      const generado = await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] });
      assert.equal(generado.status, 201);
      const rol = (await api.get(`/api/roles/${generado.json.id}`)).json;
      const fila = rol.detalle.find((d: { empleadoId: number }) => d.empleadoId === CARLOS);
      assert.equal(fila.diasTrabajados, 15);
      assert.equal(fila.sueldo, 900); // 1800 x 15 / 30
      const maria = rol.detalle.find((d: { empleadoId: number }) => d.empleadoId === 1);
      assert.equal(maria.diasTrabajados, 30);
    });

    it("el mes siguiente ya no aparece en el rol", async () => {
      const generado = await api.post("/api/roles/generar", { anio: 2026, mes: 11, novedades: [] });
      const rol = (await api.get(`/api/roles/${generado.json.id}`)).json;
      assert.ok(!rol.detalle.some((d: { empleadoId: number }) => d.empleadoId === CARLOS));
      assert.equal(rol.numEmpleados, rol.detalle.length);
    });
  });

  describe("activar y desactivar", () => {
    it("desactivar registra la salida de hoy; los meses anteriores lo siguen incluyendo", async () => {
      await editarCarlos({ fechaSalida: "" });
      const r = await api.patch(`/api/empleados/${CARLOS}/estado`);
      assert.equal(r.json.activo, false);
      assert.equal(r.json.fechaSalida, hoy());
      assert.ok((await idsDelPeriodo(2026, 8)).includes(CARLOS)); // antes quedaba fuera de todo mes
      assert.ok((await idsDelPeriodo(Number(hoy().slice(0, 4)), Number(hoy().slice(5, 7)))).includes(CARLOS));
      assert.ok(!(await idsDelPeriodo(2099, 12)).includes(CARLOS));
    });

    it("reactivar borra la salida y vuelve a entrar a los meses siguientes", async () => {
      const r = await api.patch(`/api/empleados/${CARLOS}/estado`);
      assert.equal(r.json.activo, true);
      assert.equal(r.json.fechaSalida, null);
      assert.ok((await idsDelPeriodo(2099, 12)).includes(CARLOS));
    });

    it("desactivar acepta la fecha de salida real", async () => {
      const r = await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2026-09-10" });
      assert.equal(r.json.fechaSalida, "2026-09-10");
      assert.ok((await idsDelPeriodo(2026, 9)).includes(CARLOS));
      assert.ok(!(await idsDelPeriodo(2026, 10)).includes(CARLOS));
      await api.patch(`/api/empleados/${CARLOS}/estado`); // reactivar
    });

    it("rechaza una fecha de salida inválida o anterior al ingreso y no cambia el estado", async () => {
      assert.equal((await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "ayer" })).status, 400);
      assert.equal((await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2020-01-01" })).status, 400);
      assert.equal((await carlos()).activo, true);
    });

    it("un inactivo sin fecha de salida (anterior a esta función) queda fuera de todos los meses", async () => {
      await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2026-09-10" });
      await editarCarlos({ fechaSalida: "" });
      const c = await carlos();
      assert.equal(c.activo, false);
      assert.equal(c.fechaSalida, null);
      for (const mes of [1, 6, 9, 10]) assert.ok(!(await idsDelPeriodo(2026, mes)).includes(CARLOS), `mes ${mes}`);
      await api.patch(`/api/empleados/${CARLOS}/estado`);
    });
  });
});
