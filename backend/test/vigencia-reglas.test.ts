import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consultar, ejecutar } from "../src/db.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    api.cerrar();
  }
}

const generar = (api: Cliente, mes: number) => api.post("/api/roles/generar", { anio: 2026, mes, novedades: [] });

/** La tasa de IESS personal con la que se calculó María (empleado 1, Código del Trabajo) en un mes. */
async function tasaDeMaria(api: Cliente, mes: number) {
  const { id } = (await generar(api, mes)).json;
  const detalle = (await api.get(`/api/roles/${id}`)).json.detalle;
  return detalle.find((d: { empleadoId: number }) => d.empleadoId === 1).tasaIessPersonal;
}

/** Cambia el aporte personal del Código del Trabajo desde una fecha. */
async function cambiarAporte(api: Cliente, aporte: number, vigenteDesde?: string) {
  const ct = (await api.get("/api/regimenes/CODIGO_TRABAJO")).json;
  return api.put("/api/regimenes/CODIGO_TRABAJO", { ...ct, iessPersonal: aporte, ...(vigenteDesde ? { vigenteDesde } : {}) });
}

const fechas = (versiones: { vigenteDesde: string }[]) => versiones.map((v) => v.vigenteDesde);

describe("vigencia de las reglas por fecha", () => {
  it("las reglas de fábrica son una sola versión vigente desde siempre", async () => {
    const api = await iniciar();
    try {
      const versiones = (await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json;
      assert.equal(versiones.length, 1);
      assert.equal(versiones[0].vigenteDesde, "2000-01-01");
      assert.equal((await api.get("/api/regimenes/NO_EXISTE/versiones")).status, 404);
    } finally {
      api.cerrar();
    }
  });

  it("cambiar una tasa con fecha no altera los meses anteriores", () =>
    conDemo(async (api) => {
      const r = await cambiarAporte(api, 0.1, "2026-10-01");
      assert.equal(r.status, 200);
      assert.equal(r.json.vigenteDesde, "2026-10-01");
      assert.equal(r.json.iessPersonal, 0.1);

      assert.equal(await tasaDeMaria(api, 10), 0.1);
      // Septiembre se vuelve a generar y sigue con la tasa de entonces.
      assert.equal(await tasaDeMaria(api, 9), 0.0945);

      const versiones = (await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json;
      assert.deepEqual(fechas(versiones), ["2026-10-01", "2000-01-01"]);
      assert.equal(versiones[1].iessPersonal, 0.0945);
    }));

  it("una regla que empieza a mitad de mes cuenta para el rol de ese mes", () =>
    conDemo(async (api) => {
      await cambiarAporte(api, 0.1, "2026-10-20");
      assert.equal(await tasaDeMaria(api, 10), 0.1);
      assert.equal(await tasaDeMaria(api, 9), 0.0945);
    }));

  it("una regla futura todavía no aplica a los meses anteriores a su fecha", () =>
    conDemo(async (api) => {
      await cambiarAporte(api, 0.1, "2026-11-01");
      assert.equal(await tasaDeMaria(api, 10), 0.0945);
      assert.equal(await tasaDeMaria(api, 11), 0.1);
    }));

  it("la nueva versión hereda lo que no se cambió y se puede consultar por fecha", () =>
    conDemo(async (api) => {
      const nueva = (await cambiarAporte(api, 0.1, "2026-10-01")).json;
      const vieja = (await api.get("/api/regimenes/CODIGO_TRABAJO?fecha=2026-09-30")).json;
      assert.equal(vieja.vigenteDesde, "2000-01-01");
      assert.equal(nueva.recargoSuplementarias, vieja.recargoSuplementarias);
      assert.equal(nueva.iessPatronal, vieja.iessPatronal);
      const lista = (await api.get("/api/regimenes?fecha=2026-10-01")).json;
      assert.equal(lista.find((r: { codigo: string }) => r.codigo === "CODIGO_TRABAJO").iessPersonal, 0.1);
    }));

  it("repetir la fecha corrige esa versión en vez de crear otra", async () => {
    const api = await iniciar();
    try {
      await cambiarAporte(api, 0.1, "2026-10-01");
      await cambiarAporte(api, 0.11, "2026-10-01");
      const versiones = (await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json;
      assert.equal(versiones.length, 2);
      assert.equal(versiones[0].iessPersonal, 0.11);
    } finally {
      api.cerrar();
    }
  });

  it("sin fecha corrige en el sitio la versión de hoy", async () => {
    const api = await iniciar();
    try {
      const r = await cambiarAporte(api, 0.1);
      assert.equal(r.json.vigenteDesde, "2000-01-01");
      assert.equal((await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json.length, 1);
    } finally {
      api.cerrar();
    }
  });

  it("rechaza una fecha inválida y no deja nada a medias", async () => {
    const api = await iniciar();
    try {
      for (const mala of ["2026-13-01", "01/10/2026", "1999-12-31", "no-es-fecha"]) {
        assert.equal((await cambiarAporte(api, 0.1, mala)).status, 400, mala);
      }
      assert.equal((await api.get("/api/regimenes/CODIGO_TRABAJO?fecha=ayer")).status, 400);
      // Una fecha buena con datos malos tampoco crea la versión.
      const ct = (await api.get("/api/regimenes/CODIGO_TRABAJO")).json;
      const mala = await api.put("/api/regimenes/CODIGO_TRABAJO", { ...ct, iessPersonal: 9, vigenteDesde: "2026-10-01" });
      assert.equal(mala.status, 400);
      assert.equal((await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json.length, 1);
    } finally {
      api.cerrar();
    }
  });

  it("elimina una versión, pero nunca la única", async () => {
    const api = await iniciar();
    try {
      await cambiarAporte(api, 0.1, "2026-10-01");
      assert.equal((await api.del("/api/regimenes/CODIGO_TRABAJO/versiones/2026-10-01")).status, 204);
      assert.equal((await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json.length, 1);
      assert.equal((await api.del("/api/regimenes/CODIGO_TRABAJO/versiones/2000-01-01")).status, 409);
      assert.equal((await api.del("/api/regimenes/CODIGO_TRABAJO/versiones/2030-01-01")).status, 404);
    } finally {
      api.cerrar();
    }
  });

  it("deja constancia de cada cambio en la auditoría", async () => {
    const api = await iniciar();
    try {
      await cambiarAporte(api, 0.1, "2026-10-01");
      await cambiarAporte(api, 0.11, "2026-10-01");
      await api.del("/api/regimenes/CODIGO_TRABAJO/versiones/2026-10-01");
      const filas = await consultar(api.db, "SELECT accion FROM audit_logs WHERE entidad = 'regimen' ORDER BY id");
      assert.deepEqual(filas.map((f) => f.accion), ["regimen.version_creada", "regimen.corregido", "regimen.version_eliminada"]);
    } finally {
      api.cerrar();
    }
  });

  it("una empresa nueva recibe todas las versiones de la plantilla", async () => {
    const api = await iniciar();
    try {
      await ejecutar(
        api.db,
        `INSERT INTO regimenes (cuenta_id, codigo, vigente_desde, nombre, tipo, iess_personal, iess_patronal,
           recargo_suplementarias, recargo_extraordinarias, recargo_descanso, recargo_nocturno, dias_vacaciones,
           fondos_reserva, meses_para_fondos)
         SELECT cuenta_id, codigo, '2027-01-01', nombre, tipo, 0.1, iess_patronal, recargo_suplementarias,
           recargo_extraordinarias, recargo_descanso, recargo_nocturno, dias_vacaciones, fondos_reserva, meses_para_fondos
         FROM regimenes WHERE cuenta_id = 1 AND codigo = 'CODIGO_TRABAJO'`,
      );
      const otra = await api.registrar({ empresa: "Otra S.A.", ruc: "1790010937001", email: "otra@empresa.com" });
      assert.equal(otra.status, 201);
      const versiones = (await api.get("/api/regimenes/CODIGO_TRABAJO/versiones")).json;
      assert.deepEqual(fechas(versiones), ["2027-01-01", "2000-01-01"]);
    } finally {
      api.cerrar();
    }
  });
});
