import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calcularRol, calcularRolConTraza, CANASTAS_POR_CARGAS, rebajaPorGastosPersonales, REGLAS_CT_2026, retencionIrMensual,
} from "../src/calculos.ts";
import type { EntradaRol, ReglasRol } from "../src/calculos.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const CANASTA = 821.8;
const CON_CANASTA: ReglasRol = { ...REGLAS_CT_2026, canastaBasica: CANASTA };
const MARIA = "1801234566"; // 4500: IR anual 5545.50 (tramo 46575 a 62005)
const CARLOS = "1702345677"; // 1800: IR anual 567.98 (tramo 15549 a 20188)

describe("rebaja por gastos personales", () => {
  it("el tope es la canasta por las canastas de las cargas, y la rebaja el 18 % de lo admitido", () => {
    const r = (gastos: number, cargas: number, catastrofica = false) =>
      rebajaPorGastosPersonales(gastos, cargas, catastrofica, CANASTA);
    // sin cargas: 7 canastas = 5752.60 y 1035.47 como máximo (los topes que publica el SRI para 2026)
    assert.equal(r(9999, 0).tope.toFixed(2), "5752.60");
    assert.equal(r(9999, 0).rebaja.toFixed(2), "1035.47");
    assert.equal(r(9999, 1).rebaja.toFixed(2), "1331.32");
    assert.equal(r(9999, 2).rebaja.toFixed(2), "1627.16");
    assert.equal(r(99999, 3).rebaja.toFixed(2), "2070.94");
    assert.equal(r(99999, 4).rebaja.toFixed(2), "2514.71");
    assert.equal(r(99999, 5).rebaja.toFixed(2), "2958.48");
    assert.equal(r(999999, 0, true).tope.toFixed(2), "82180.00"); // 100 canastas
    assert.equal(r(999999, 0, true).rebaja.toFixed(2), "14792.40");
  });

  it("con gastos menores al tope, la rebaja es el 18 % de lo gastado", () => {
    const r = rebajaPorGastosPersonales(2000, 2, false, CANASTA);
    assert.equal(r.gastosAdmitidos.toFixed(2), "2000.00");
    assert.equal(r.rebaja.toFixed(2), "360.00");
    assert.equal(r.canastas, 11);
  });

  it("las cargas de más de cinco valen como cinco, y las negativas como cero; sin canasta, no hay rebaja", () => {
    assert.equal(rebajaPorGastosPersonales(99999, 9, false, CANASTA).canastas, CANASTAS_POR_CARGAS[5]);
    assert.equal(rebajaPorGastosPersonales(99999, -2, false, CANASTA).canastas, CANASTAS_POR_CARGAS[0]);
    assert.equal(rebajaPorGastosPersonales(5000, 0, false, 0).rebaja.toFixed(2), "0.00");
    assert.equal(rebajaPorGastosPersonales(-100, 0, false, CANASTA).rebaja.toFixed(2), "0.00");
  });

  it("la rebaja nunca deja el impuesto bajo cero", () => {
    const r = retencionIrMensual(1200, "113.40", REGLAS_CT_2026.tablaIr, 540);
    assert.equal(r.irAnual.toFixed(2), "41.56");
    assert.equal(r.rebajaAnual.toFixed(2), "41.56");
    assert.equal(r.irMensual.toFixed(2), "0.00");
  });
});

describe("el rol con la rebaja", () => {
  const maria: EntradaRol = { sueldoBase: 4500, fechaIngreso: "2019-03-01", anio: 2026, mes: 10 };

  it("sin gastos declarados el resultado es el de siempre", () => {
    const antes = calcularRol(maria, REGLAS_CT_2026);
    const con = calcularRol({ ...maria, gastosPersonales: 0, cargasFamiliares: 3 }, CON_CANASTA);
    assert.equal(antes.impuestoRenta, 462.13);
    assert.equal(con.impuestoRenta, 462.13);
    assert.equal(con.rebajaIrAnual, 0);
    assert.equal(con.netoPagar, antes.netoPagar);
  });

  it("resta la rebaja al impuesto anual y reparte lo que queda en 12 cuotas", () => {
    // 4500: IR 5545.50; con una carga (9 canastas, tope 7396.20) y 6000 de gastos: rebaja 1080.00
    const r = calcularRol({ ...maria, gastosPersonales: 6000, cargasFamiliares: 1 }, CON_CANASTA);
    assert.equal(r.irAnual, 5545.5); // el de la tabla, antes de la rebaja
    assert.equal(r.rebajaIrAnual, 1080);
    assert.equal(r.impuestoRenta, 372.13); // (5545.50 − 1080.00) ÷ 12 = 372.125
    const sin = calcularRol(maria, REGLAS_CT_2026);
    assert.equal(sin.netoPagar - r.netoPagar, -(462.13 - 372.13)); // el neto sube lo que baja el impuesto
    assert.equal(r.aporteIess, sin.aporteIess); // el IESS no cambia
  });

  it("topa los gastos: gastos de 99 999 con dos cargas rebajan 1627.16", () => {
    const r = calcularRol({ ...maria, gastosPersonales: 99999, cargasFamiliares: 2 }, CON_CANASTA);
    assert.equal(r.rebajaIrAnual, 1627.16);
  });

  it("una enfermedad catastrófica sube el tope, pero nunca más del impuesto", () => {
    const r = calcularRol({ ...maria, gastosPersonales: 50000, enfermedadCatastrofica: true }, CON_CANASTA);
    assert.equal(r.rebajaIrAnual, 5545.5); // 18 % de 50 000 = 9000, pero el impuesto es 5545.50
    assert.equal(r.impuestoRenta, 0);
  });

  it("sin canasta básica definida no hay rebaja", () => {
    const r = calcularRol({ ...maria, gastosPersonales: 6000, cargasFamiliares: 1 }, REGLAS_CT_2026);
    assert.equal(r.rebajaIrAnual, 0);
    assert.equal(r.impuestoRenta, 462.13);
  });

  it("la traza cuenta la rebaja con sus números y cuadra con el resultado", () => {
    const { resultado, traza } = calcularRolConTraza({ ...maria, gastosPersonales: 6000, cargasFamiliares: 1 }, CON_CANASTA);
    const rebaja = traza.pasos.find((p) => p.clave === "rebajaIrAnual")!;
    assert.equal(rebaja.resultado, resultado.rebajaIrAnual);
    assert.equal(rebaja.detalle, "6000.00 contra el tope 821.80 × 9 = 7396.20: 6000.00 × 18 % = 1080.00");
    const mes = traza.pasos.find((p) => p.clave === "impuestoRenta")!;
    assert.equal(mes.formula, "(impuesto anual − rebaja) ÷ 12");
    assert.equal(mes.detalle, "(5545.50 − 1080.00) ÷ 12 = 372.13");
    assert.equal(mes.resultado, resultado.impuestoRenta);
    // el orden: el impuesto anual, la rebaja y el impuesto del mes
    const claves = traza.pasos.map((p) => p.clave);
    assert.ok(claves.indexOf("irAnual") < claves.indexOf("rebajaIrAnual") && claves.indexOf("rebajaIrAnual") < claves.indexOf("impuestoRenta"));
  });

  it("explica cuando la rebaja se queda corta por el impuesto", () => {
    const { traza } = calcularRolConTraza({ ...maria, sueldoBase: 1200, gastosPersonales: 3000 }, CON_CANASTA);
    assert.match(traza.pasos.find((p) => p.clave === "rebajaIrAnual")!.detalle, /se resta 41\.56 porque no puede pasar del impuesto/);
  });

  it("sin gastos, la traza no menciona la rebaja", () => {
    assert.equal(calcularRolConTraza(maria, CON_CANASTA).traza.pasos.some((p) => p.clave === "rebajaIrAnual"), false);
  });
});

async function conEmpresa(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const empleado = async (api: Cliente, cedula: string) =>
  (await api.get("/api/empleados")).json.find((e: { cedula: string }) => e.cedula === cedula);

const declarar = async (api: Cliente, cedula: string, datos: object) => {
  const e = await empleado(api, cedula);
  return api.put(`/api/empleados/${e.id}`, { ...e, ...datos });
};

const filaDe = (rol: { detalle: Record<string, number | string>[] }, cedula: string) => rol.detalle.find((d) => d.cedula === cedula)!;

describe("gastos personales en el empleado", () => {
  it("un empleado nuevo empieza sin gastos ni cargas", () =>
    conEmpresa(async (api) => {
      const e = await empleado(api, MARIA);
      assert.deepEqual([e.gastosPersonales, e.cargasFamiliares, e.enfermedadCatastrofica], [0, 0, false]);
    }));

  it("se guardan y se leen de vuelta", () =>
    conEmpresa(async (api) => {
      const r = await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1, enfermedadCatastrofica: true });
      assert.equal(r.status, 200, r.texto);
      assert.deepEqual([r.json.gastosPersonales, r.json.cargasFamiliares, r.json.enfermedadCatastrofica], [6000, 1, true]);
    }));

  it("si el pedido no los trae, se conservan los que ya tenía", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 2 });
      const e = await empleado(api, MARIA);
      const { gastosPersonales: _g, cargasFamiliares: _c, enfermedadCatastrofica: _e, ...sin } = e;
      const r = await api.put(`/api/empleados/${e.id}`, { ...sin, cargo: "Gerente" });
      assert.equal(r.status, 200, r.texto);
      assert.deepEqual([r.json.gastosPersonales, r.json.cargasFamiliares], [6000, 2]);
    }));

  it("rechaza valores imposibles", () =>
    conEmpresa(async (api) => {
      const malos: [object, RegExp][] = [
        [{ gastosPersonales: -1 }, /Gastos personales/],
        [{ gastosPersonales: "mucho" }, /Gastos personales/],
        [{ cargasFamiliares: 6 }, /Cargas familiares/],
        [{ cargasFamiliares: 1.5 }, /Cargas familiares/],
        [{ cargasFamiliares: -1 }, /Cargas familiares/],
        [{ enfermedadCatastrofica: "si" }, /Enfermedad catastrófica/],
      ];
      for (const [datos, mensaje] of malos) {
        const r = await declarar(api, MARIA, datos);
        assert.equal(r.status, 400, JSON.stringify(datos));
        assert.match(r.json.errores.join(" "), mensaje);
      }
      assert.equal((await empleado(api, MARIA)).gastosPersonales, 0);
    }));
});

describe("la rebaja en el rol guardado", () => {
  it("el rol usa los gastos del empleado y guarda lo que usó", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1 });
      const generado = await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] });
      assert.equal(generado.status, 201, generado.texto);
      const rol = (await api.get(`/api/roles/${generado.json.id}`)).json;
      const maria = filaDe(rol, MARIA);
      assert.equal(maria.irAnual, 5545.5);
      assert.equal(maria.rebajaIrAnual, 1080);
      assert.equal(maria.impuestoRenta, 372.13);
      assert.deepEqual([maria.gastosPersonales, maria.cargasFamiliares, maria.enfermedadCatastrofica], [6000, 1, 0]);
      // los demás no declararon nada
      assert.equal(filaDe(rol, CARLOS).rebajaIrAnual, 0);
      assert.equal(filaDe(rol, CARLOS).impuestoRenta, 47.33);
    }));

  it("la traza guardada cuenta la rebaja", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1 });
      const id = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json.id;
      const t = (await api.get(`/api/roles/${id}/traza/${MARIA}`)).json;
      assert.equal(t.pasos.find((p: { clave: string }) => p.clave === "rebajaIrAnual").resultado, 1080);
    }));

  it("cambiar al empleado después no altera un rol ya publicado", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1 });
      const id = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json.id;
      for (const p of ["validar", "aprobar", "publicar"]) await api.post(`/api/roles/${id}/${p}`);
      await declarar(api, MARIA, { gastosPersonales: 0, cargasFamiliares: 0 });
      const maria = filaDe((await api.get(`/api/roles/${id}`)).json, MARIA);
      assert.deepEqual([maria.gastosPersonales, maria.rebajaIrAnual, maria.impuestoRenta], [6000, 1080, 372.13]);
    }));

  it("una reliquidación conserva los gastos que tenía el rol original", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1 });
      const id = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json.id;
      for (const p of ["validar", "aprobar", "publicar"]) await api.post(`/api/roles/${id}/${p}`);
      await declarar(api, MARIA, { gastosPersonales: 0, cargasFamiliares: 0 }); // después la persona cambia su proyección
      const ajuste = await api.post(`/api/roles/${id}/reliquidar`, { motivo: "Faltaron comisiones", cambios: [{ cedula: MARIA, comisiones: 100 }] });
      assert.equal(ajuste.status, 201, ajuste.texto);
      const traza = (await api.get(`/api/roles/${ajuste.json.id}/traza/${MARIA}`)).json;
      // con 100 más de comisiones sube la base, pero la rebaja sigue siendo la del rol original
      assert.equal(traza.pasos.find((p: { clave: string }) => p.clave === "rebajaIrAnual").resultado, 1080);
    }));

  it("avisa si hay gastos declarados y el año no tiene canasta básica", () =>
    conEmpresa(async (api) => {
      await declarar(api, MARIA, { gastosPersonales: 6000, cargasFamiliares: 1 });
      const p = (await api.get("/api/parametros?anio=2026")).json;
      assert.equal(p.canastaBasica, 821.8);
      const quitada = await api.put("/api/parametros/2026", { sbu: p.sbu, tablaIr: p.tablaIr, fuente: p.fuente, canastaBasica: 0 });
      assert.equal(quitada.status, 200, quitada.texto);
      const r = await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] });
      assert.match(r.json.avisos.join(" "), /no tienen canasta básica: no se aplicó la rebaja/);
      assert.equal(filaDe((await api.get(`/api/roles/${r.json.id}`)).json, MARIA).rebajaIrAnual, 0);
    }));
});

describe("la canasta básica en los parámetros", () => {
  it("la cuenta nueva recibe la canasta de 2026 y se puede cambiar sin tocar el resto", () =>
    conEmpresa(async (api) => {
      const antes = (await api.get("/api/parametros?anio=2026")).json;
      assert.equal(antes.canastaBasica, 821.8);
      const r = await api.put("/api/parametros/2026", { sbu: antes.sbu, tablaIr: antes.tablaIr, fuente: antes.fuente, canastaBasica: 830.5 });
      assert.equal(r.status, 200, r.texto);
      const despues = (await api.get("/api/parametros?anio=2026")).json;
      assert.equal(despues.canastaBasica, 830.5);
      assert.equal(despues.sbu, antes.sbu);
    }));

  it("si el pedido no trae la canasta, conserva la del año", () =>
    conEmpresa(async (api) => {
      const p = (await api.get("/api/parametros?anio=2026")).json;
      await api.put("/api/parametros/2026", { sbu: p.sbu + 1, tablaIr: p.tablaIr, fuente: p.fuente });
      assert.equal((await api.get("/api/parametros?anio=2026")).json.canastaBasica, 821.8);
    }));

  it("un año nuevo empieza sin canasta, y una canasta inválida se rechaza", () =>
    conEmpresa(async (api) => {
      const p = (await api.get("/api/parametros?anio=2026")).json;
      assert.equal((await api.put("/api/parametros/2027", { sbu: 500, tablaIr: p.tablaIr, fuente: "x" })).status, 200);
      assert.equal((await api.get("/api/parametros?anio=2027")).json.canastaBasica, 0);
      const mala = await api.put("/api/parametros/2027", { sbu: 500, tablaIr: p.tablaIr, fuente: "x", canastaBasica: -5 });
      assert.equal(mala.status, 400);
      assert.match(mala.json.errores.join(" "), /Canasta básica/);
    }));
});
