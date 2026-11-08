import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consultar } from "../src/db.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

// Empleados de ejemplo: 1 María (CT, $4500), 2 Carlos (CT, $1800), 3 Lucía (LOSEP), 4 José (CT),
// 5 Daniela (LOEP servidor), 6 Pedro (LOEP obrero, ingresa el 2026-10-16).
const CARLOS = "1702345677";
const MARIA = "1801234566";

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

/** Lleva un rol por los pasos dados (validar, aprobar, publicar...) y comprueba que todos salgan bien. */
async function avanzar(api: Cliente, id: number, pasos = ["validar", "aprobar", "publicar"]) {
  for (const paso of pasos) {
    const r = await api.post(`/api/roles/${id}/${paso}`);
    assert.equal(r.status, 200, `${paso}: ${r.texto}`);
  }
}

/** Genera el rol de octubre y lo publica. */
async function rolPublicado(api: Cliente, novedades: object[] = []) {
  const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades })).json;
  await avanzar(api, id);
  return id as number;
}

const reliquidar = (api: Cliente, id: number, cambios: object[], motivo = "Se olvidaron las comisiones de octubre") =>
  api.post(`/api/roles/${id}/reliquidar`, { motivo, cambios });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const detalleDe = (rol: { detalle: any[] }, cedula: string) => rol.detalle.find((d) => d.cedula === cedula);

describe("reliquidación de un rol publicado", () => {
  it("crea un ajuste vinculado que guarda solo la diferencia y no toca el original", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      const antes = (await api.get(`/api/roles/${id}`)).json;

      const r = await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }]);
      assert.equal(r.status, 201, r.texto);
      assert.equal(r.json.empleados, 1);

      const ajuste = (await api.get(`/api/roles/${r.json.id}`)).json;
      assert.equal(ajuste.tipo, "ajuste");
      assert.equal(ajuste.rolOrigenId, id);
      assert.equal(ajuste.estado, "calculado");
      assert.equal(ajuste.origen.id, id);
      assert.equal(ajuste.motivo, "Se olvidaron las comisiones de octubre");
      assert.equal(ajuste.detalle.length, 1);
      const d = ajuste.detalle[0];
      assert.equal(d.cedula, CARLOS);
      assert.equal(d.comisiones, 200);
      assert.equal(d.ingresosAportables, 200);
      assert.ok(d.totalIngresos > 200); // más los décimos y fondos que se pagan en el rol
      assert.equal(d.aporteIess, 18.9); // 9,45 % de 200
      assert.equal(ajuste.totalNeto, d.netoPagar);
      assert.ok(d.netoPagar > 0);

      const despues = (await api.get(`/api/roles/${id}`)).json;
      assert.deepEqual(despues.detalle, antes.detalle);
      assert.equal(despues.totalNeto, antes.totalNeto);
      assert.equal(despues.ajustes.length, 1);
      assert.equal(despues.ajustes[0].id, r.json.id);
    }));

  it("original más ajustes da lo mismo que haber generado el rol bien desde el principio", async () => {
    const corregido = await iniciar();
    const reliquidado = await iniciar();
    try {
      await cargarEmpleadosDePrueba(corregido);
      await cargarEmpleadosDePrueba(reliquidado);
      const bien = (await corregido.post("/api/roles/generar", {
        anio: 2026, mes: 10, novedades: [{ empleadoId: 2, comisiones: 200, horasSuplementarias: 6, otrosDescuentos: 25 }],
      })).json.id;
      const esperado = (await corregido.get(`/api/roles/${bien}`)).json;

      const id = await rolPublicado(reliquidado);
      const r = await reliquidar(reliquidado, id, [{ cedula: CARLOS, comisiones: 200, horasSuplementarias: 6, otrosDescuentos: 25 }]);
      assert.equal(r.status, 201, r.texto);
      await avanzar(reliquidado, r.json.id);

      const rol = (await reliquidado.get(`/api/roles/${id}`)).json;
      const carlos = rol.vigente.find((v: { cedula: string }) => v.cedula === CARLOS);
      const quien = detalleDe(esperado, CARLOS);
      for (const campo of ["totalIngresos", "aporteIess", "impuestoRenta", "totalDescuentos", "netoPagar", "totalProvisiones", "costoEmpleador"]) {
        assert.equal(carlos[campo], quien[campo], campo);
      }
      assert.equal(rol.consolidado.totalNeto, esperado.totalNeto);
      assert.equal(rol.consolidado.totalCosto, esperado.totalCosto);
    } finally {
      await corregido.cerrar();
      await reliquidado.cerrar();
    }
  });

  it("recorre el mismo ciclo y el consolidado cuenta solo los ajustes publicados", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      const original = (await api.get(`/api/roles/${id}`)).json;
      const { id: ajusteId } = (await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }])).json;

      assert.equal((await api.get(`/api/roles/${id}`)).json.consolidado.totalNeto, original.totalNeto); // aún sin publicar
      const v = await api.post(`/api/roles/${ajusteId}/validar`);
      assert.equal(v.json.valido, true);
      await avanzar(api, ajusteId, ["aprobar", "publicar"]);

      const ajuste = (await api.get(`/api/roles/${ajusteId}`)).json;
      const rol = (await api.get(`/api/roles/${id}`)).json;
      assert.equal(rol.consolidado.totalNeto, Math.round((original.totalNeto + ajuste.totalNeto) * 100) / 100);
      assert.equal(rol.vigente.find((x: { cedula: string }) => x.cedula === CARLOS).comisiones, 200);

      // Publicado, el ajuste es inmutable como cualquier rol.
      assert.equal((await api.del(`/api/roles/${ajusteId}`)).status, 409);
      const pagado = await api.post(`/api/roles/${ajusteId}/pagar`);
      assert.equal(pagado.status, 200);
    }));

  it("un segundo ajuste parte de lo ya ajustado: deshacer el primero deja el rol como el original", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      const original = (await api.get(`/api/roles/${id}`)).json;
      const primero = (await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }])).json.id;
      await avanzar(api, primero);

      const segundo = await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 0 }], "Las comisiones eran de otro mes");
      assert.equal(segundo.status, 201, segundo.texto);
      const ajuste = (await api.get(`/api/roles/${segundo.json.id}`)).json;
      assert.equal(ajuste.detalle[0].comisiones, -200);
      assert.ok(ajuste.detalle[0].netoPagar < 0);
      // Un ajuste con neto negativo es válido: es un descuento.
      assert.equal((await api.post(`/api/roles/${segundo.json.id}/validar`)).json.valido, true);
      await avanzar(api, segundo.json.id, ["aprobar", "publicar"]);

      const rol = (await api.get(`/api/roles/${id}`)).json;
      assert.equal(rol.consolidado.totalNeto, original.totalNeto);
      const carlos = rol.vigente.find((x: { cedula: string }) => x.cedula === CARLOS);
      assert.equal(carlos.netoPagar, detalleDe(original, CARLOS).netoPagar);
    }));

  it("sin cambios pedidos recoge una corrección de las reglas de ese mes", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      // Se descubre que el aporte personal del Código del Trabajo estaba mal desde antes de octubre.
      const ct = (await api.get("/api/regimenes/CODIGO_TRABAJO")).json;
      await api.put("/api/regimenes/CODIGO_TRABAJO", { ...ct, iessPersonal: 0.1, vigenteDesde: "2026-10-01" });

      const r = await reliquidar(api, id, [], "Corrección del aporte personal del IESS");
      assert.equal(r.status, 201, r.texto);
      const ajuste = (await api.get(`/api/roles/${r.json.id}`)).json;
      // Solo cambian quienes se rigen por el Código del Trabajo (María, Carlos, José, Pedro) y su aporte sube.
      assert.deepEqual(ajuste.detalle.map((d: { cedula: string }) => d.cedula).sort(), ["0104567896", "0606789014", MARIA, CARLOS].sort());
      const maria = detalleDe(ajuste, MARIA);
      assert.equal(maria.aporteIess, 24.75); // (10 % - 9,45 %) de 4500
    }));

  it("exige un motivo, que el rol esté publicado y que algo cambie", () =>
    conDemo(async (api) => {
      const { id: calculado } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      const temprano = await reliquidar(api, calculado, [{ cedula: CARLOS, comisiones: 1 }]);
      assert.equal(temprano.status, 409);

      await avanzar(api, calculado);
      assert.equal((await reliquidar(api, calculado, [{ cedula: CARLOS, comisiones: 1 }], "")).status, 400);
      assert.equal((await reliquidar(api, calculado, [{ cedula: CARLOS, comisiones: 1 }], "no")).status, 400);
      const igual = await reliquidar(api, calculado, [{ cedula: CARLOS, comisiones: 0 }]);
      assert.equal(igual.status, 400);
      assert.match(igual.json.errores[0], /no hay nada que ajustar/);
      assert.equal((await reliquidar(api, calculado, [{ cedula: "0000000000", comisiones: 1 }])).status, 400);
      assert.equal((await reliquidar(api, calculado, [{ cedula: CARLOS, comisiones: -5 }])).status, 400);
      assert.equal((await reliquidar(api, 99999, [])).status, 404);
      assert.equal((await consultar(api.db, "SELECT COUNT(*) AS n FROM roles_cabecera WHERE tipo = 'ajuste'"))[0].n, 0);
    }));

  it("solo hay un ajuste abierto por rol y un ajuste no se reliquida", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      const primero = await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }]);
      assert.equal(primero.status, 201);
      const repetido = await reliquidar(api, id, [{ cedula: MARIA, comisiones: 100 }]);
      assert.equal(repetido.status, 409);
      assert.equal((await reliquidar(api, primero.json.id, [{ cedula: CARLOS, comisiones: 5 }])).status, 409);

      // Eliminar el ajuste abierto libera el lugar.
      assert.equal((await api.del(`/api/roles/${primero.json.id}`)).status, 204);
      assert.equal((await reliquidar(api, id, [{ cedula: MARIA, comisiones: 100 }])).status, 201);
    }));

  it("el rol ordinario del mes sigue siendo único y los ajustes no lo confunden", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }]);
      const otra = await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] });
      assert.equal(otra.status, 409); // el rol de octubre está publicado
      const periodo = (await api.get("/api/roles/periodo/2026/10")).json;
      assert.equal(periodo.estado, "publicado");
      const lista = (await api.get("/api/roles")).json;
      assert.deepEqual(lista.map((r: { tipo: string }) => r.tipo).sort(), ["ajuste", "ordinario"]);
    }));

  it("deja constancia en la auditoría del rol original y del ajuste", () =>
    conDemo(async (api) => {
      const id = await rolPublicado(api);
      const { id: ajusteId } = (await reliquidar(api, id, [{ cedula: CARLOS, comisiones: 200 }])).json;
      const delOriginal = (await api.get(`/api/roles/${id}/historial`)).json.map((h: { accion: string }) => h.accion);
      assert.ok(delOriginal.includes("rol.ajuste_creado"));
      const delAjuste = (await api.get(`/api/roles/${ajusteId}/historial`)).json;
      assert.equal(delAjuste[0].accion, "rol.calculado");
      assert.equal(delAjuste[0].detalle.origen, id);
      assert.equal(delAjuste[0].detalle.motivo, "Se olvidaron las comisiones de octubre");
    }));

  it("la base impide un ajuste de un rol sin publicar o de otro mes", () =>
    conDemo(async (api) => {
      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      const insertar = (origen: number, anio: number, mes: number) => consultar(
        api.db,
        `INSERT INTO roles_cabecera (cuenta_id, anio, mes, generado_en, num_empleados, total_ingresos, total_descuentos,
           total_neto, total_provisiones, total_costo, tipo, rol_origen_id, motivo)
         VALUES (2, ?, ?, 'x', 0, 0, 0, 0, 0, 0, 'ajuste', ?, 'prueba')`,
        anio, mes, origen,
      );
      await assert.rejects(insertar(id, 2026, 10), /ajuste corrige a un rol ordinario publicado/); // sin publicar
      await avanzar(api, id);
      await assert.rejects(insertar(id, 2026, 9), /ajuste corrige a un rol ordinario publicado/); // otro mes
    }));
});
