import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ejecutar } from "../src/db.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

// Empleados de ejemplo: 1 María (CT), 2 Carlos (CT), 3 Lucía (LOSEP), 4 José (CT), 5 Daniela (LOEP servidor), 6 Pedro (LOEP obrero).
const MARIA = "1801234566";
const CARLOS = "1702345677";
const DANIELA = "1715678908";
const PEDRO = "0606789014";

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const generar = async (api: Cliente, novedades: object[] = []) =>
  (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades })).json.id as number;

const traza = (api: Cliente, id: number, cedula: string) => api.get(`/api/roles/${id}/traza/${cedula}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paso = (t: any, clave: string) => t.pasos.find((p: { clave: string }) => p.clave === clave);

describe("traza guardada con el rol", () => {
  it("cada empleado trae su desglose, con el régimen y la versión de reglas que se usaron", () =>
    conDemo(async (api) => {
      const id = await generar(api);
      const r = await traza(api, id, MARIA);
      assert.equal(r.status, 200, r.texto);
      assert.equal(r.json.nombres, "María Fernanda Paredes");
      assert.deepEqual(r.json.contexto, { regimen: "CODIGO_TRABAJO", vigenteDesde: "2000-01-01", anioParametros: 2026, sbu: 482 });

      const detalle = (await api.get(`/api/roles/${id}`)).json.detalle;
      const maria = detalle.find((d: { cedula: string }) => d.cedula === MARIA);
      assert.equal(paso(r.json, "netoPagar").resultado, maria.netoPagar);
      assert.equal(paso(r.json, "aporteIess").resultado, maria.aporteIess);
      assert.ok(detalle.every((d: { tieneTraza: boolean }) => d.tieneTraza));
      assert.ok(detalle.every((d: Record<string, unknown>) => !("traza" in d))); // el detalle no la arrastra
    }));

  it("recoge el régimen que de verdad se aplicó a un empleado de la LOEP", () =>
    conDemo(async (api) => {
      const id = await generar(api);
      assert.equal((await traza(api, id, DANIELA)).json.contexto.regimen, "LOSEP"); // servidor
      assert.equal((await traza(api, id, PEDRO)).json.contexto.regimen, "CODIGO_TRABAJO"); // obrero
    }));

  it("dice con qué versión de las reglas se calculó cada mes", () =>
    conDemo(async (api) => {
      const ct = (await api.get("/api/regimenes/CODIGO_TRABAJO")).json;
      await api.put("/api/regimenes/CODIGO_TRABAJO", { ...ct, iessPersonal: 0.1, vigenteDesde: "2026-10-01" });
      const octubre = await generar(api);
      const t = (await traza(api, octubre, CARLOS)).json;
      assert.equal(t.contexto.vigenteDesde, "2026-10-01");
      assert.match(paso(t, "aporteIess").detalle, /× 10 % =/);

      const septiembre = (await api.post("/api/roles/generar", { anio: 2026, mes: 9, novedades: [] })).json.id;
      const antes = (await traza(api, septiembre, CARLOS)).json;
      assert.equal(antes.contexto.vigenteDesde, "2000-01-01");
      assert.match(paso(antes, "aporteIess").detalle, /× 9.45 % =/);
    }));

  it("la traza de un rol publicado no cambia aunque después se edite la regla", () =>
    conDemo(async (api) => {
      const id = await generar(api);
      for (const p of ["validar", "aprobar", "publicar"]) assert.equal((await api.post(`/api/roles/${id}/${p}`)).status, 200);
      const antes = (await traza(api, id, CARLOS)).json;

      const ct = (await api.get("/api/regimenes/CODIGO_TRABAJO")).json;
      await api.put("/api/regimenes/CODIGO_TRABAJO", { ...ct, iessPersonal: 0.12 });
      assert.deepEqual((await traza(api, id, CARLOS)).json, antes);
      assert.match(paso(antes, "aporteIess").detalle, /9.45 %/);
    }));

  it("la traza de un ajuste explica el mes completo, no la diferencia", () =>
    conDemo(async (api) => {
      const id = await generar(api);
      for (const p of ["validar", "aprobar", "publicar"]) await api.post(`/api/roles/${id}/${p}`);
      const original = (await traza(api, id, CARLOS)).json;
      const ajusteId = (await api.post(`/api/roles/${id}/reliquidar`, {
        motivo: "Faltaron las comisiones", cambios: [{ cedula: CARLOS, comisiones: 200 }],
      })).json.id;

      const t = (await traza(api, ajusteId, CARLOS)).json;
      assert.equal(t.ajuste, true);
      assert.equal(t.contexto.ajuste, true);
      const detalle = (await api.get(`/api/roles/${ajusteId}`)).json.detalle[0];
      assert.ok(detalle.netoPagar < 300); // lo que guarda el ajuste: la diferencia
      assert.ok(paso(t, "netoPagar").resultado > 1000); // lo que explica la traza: el neto completo
      assert.equal(paso(t, "comisiones").resultado, 200);
      assert.equal(paso(original, "comisiones"), undefined);
    }));

  it("responde 404 si la persona no está en el rol, si el rol no es de la empresa o si es anterior a la traza", () =>
    conDemo(async (api) => {
      const id = await generar(api);
      assert.equal((await traza(api, id, "0000000000")).status, 404);
      assert.equal((await traza(api, 99999, CARLOS)).status, 404);

      await ejecutar(api.db, "UPDATE roles_detalle SET traza = NULL WHERE rol_id = ?", id);
      const vieja = await traza(api, id, CARLOS);
      assert.equal(vieja.status, 404);
      assert.match(vieja.json.errores[0], /antes de que se guardara el desglose/);
      const detalle = (await api.get(`/api/roles/${id}`)).json.detalle;
      assert.ok(detalle.every((d: { tieneTraza: boolean }) => !d.tieneTraza));

      const sesionAnterior = (await api.get("/api/auth/yo")).json;
      assert.ok(sesionAnterior);
      await api.registrar({ empresa: "Otra S.A.", ruc: "1790010937001", email: "otra@empresa.com" });
      assert.equal((await traza(api, id, CARLOS)).status, 404); // ahora la sesión es de otra empresa
    }));
});
