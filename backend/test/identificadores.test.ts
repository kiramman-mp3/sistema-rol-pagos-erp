import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ErrorApi, leerId } from "../src/validaciones.ts";
import { EMPLEADO, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

describe("leerId", () => {
  it("acepta enteros positivos", () => {
    assert.equal(leerId("1"), 1);
    assert.equal(leerId("42"), 42);
    assert.equal(leerId("2147483647"), 2147483647);
  });

  it("rechaza todo lo demás con un 400", () => {
    for (const malo of ["", "abc", "0", "-1", "1.5", "1e3", " 1", "1 ", "0x10", "2147483648", "99999999999999999999", "NaN", "Infinity"]) {
      assert.throws(
        () => leerId(malo),
        (e) => e instanceof ErrorApi && e.status === 400 && e.errores[0] === "Identificador inválido.",
        malo,
      );
    }
  });
});

describe("identificadores inválidos en la API", () => {
  let api: Cliente;
  before(async () => {
    api = await iniciar();
  });
  after(() => api.cerrar());

  const MALOS = ["abc", "0", "-1", "1.5", "99999999999"];

  it("en la ruta responden 400 y no 500", async () => {
    for (const id of MALOS) {
      for (const ruta of [
        `/api/empleados/${id}`, `/api/roles/${id}`, `/api/roles/${id}/csv`, `/api/roles/${id}/iess`,
        `/api/roles/${id}/iess.csv`, `/api/puestos/${id}`, `/api/escala/${id}`,
      ]) {
        const r = await api.get(ruta);
        assert.equal(r.status, 400, ruta);
        assert.deepEqual(r.json, { errores: ["Identificador inválido."] }, ruta);
      }
      assert.equal((await api.put(`/api/empleados/${id}`, EMPLEADO)).status, 400, `PUT empleados/${id}`);
      assert.equal((await api.patch(`/api/empleados/${id}/estado`)).status, 400, `PATCH estado ${id}`);
      assert.equal((await api.del(`/api/empleados/${id}`)).status, 400, `DELETE empleados/${id}`);
      assert.equal((await api.del(`/api/roles/${id}`)).status, 400, `DELETE roles/${id}`);
      assert.equal((await api.put(`/api/puestos/${id}`, {})).status, 400, `PUT puestos/${id}`);
      assert.equal((await api.patch(`/api/puestos/${id}/responsable`, { empleadoId: null })).status, 400);
      assert.equal((await api.del(`/api/puestos/${id}`)).status, 400, `DELETE puestos/${id}`);
      assert.equal((await api.put(`/api/escala/${id}`, {})).status, 400, `PUT escala/${id}`);
      assert.equal((await api.del(`/api/escala/${id}`)).status, 400, `DELETE escala/${id}`);
    }
  });

  it("un identificador válido que no existe sigue siendo 404", async () => {
    assert.equal((await api.get("/api/empleados/9999")).status, 404);
    assert.equal((await api.get("/api/roles/9999")).status, 404);
    assert.equal((await api.get("/api/puestos/9999")).status, 404);
    assert.equal((await api.get("/api/escala/9999")).status, 404);
  });

  it("en el cuerpo, un identificador que no es entero se rechaza con un error de validación", async () => {
    for (const malo of ["abc", 1.5, -1, 99999999999, {}]) {
      const empleado = await api.post("/api/empleados", { ...EMPLEADO, puestoId: malo });
      assert.equal(empleado.status, 400, `puestoId ${JSON.stringify(malo)}`);
      const grado = await api.post("/api/empleados", { ...EMPLEADO, escalaId: malo });
      assert.equal(grado.status, 400, `escalaId ${JSON.stringify(malo)}`);
      const puesto = await api.post("/api/puestos", {
        nombre: "X", funcion: "f", responsabilidad: "r", sector: "s", escalaId: 33, superiorId: malo,
      });
      assert.equal(puesto.status, 400, `superiorId ${JSON.stringify(malo)}`);
      const responsable = await api.patch("/api/puestos/1/responsable", { empleadoId: malo });
      assert.equal(responsable.status, 400, `empleadoId ${JSON.stringify(malo)}`);
    }
  });
});
