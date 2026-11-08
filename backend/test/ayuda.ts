import type { AddressInfo } from "node:net";

import { crearApp } from "../src/app.ts";
import { abrirBase } from "../src/db.ts";
import type { Base } from "../src/db.ts";

export interface Cliente {
  /** La base de esta API, para comprobar lo que la API no expone. */
  db: Base;
  get: (ruta: string) => Promise<Respuesta>;
  post: (ruta: string, cuerpo?: unknown) => Promise<Respuesta>;
  put: (ruta: string, cuerpo?: unknown) => Promise<Respuesta>;
  patch: (ruta: string, cuerpo?: unknown) => Promise<Respuesta>;
  del: (ruta: string) => Promise<Respuesta>;
  /** Desde aquí, todas las peticiones llevan esta cookie (`null` la quita). */
  usarCookie: (cookie: string | null) => void;
  /** Registra otra empresa y, si sale bien, deja la sesión abierta en ella. */
  registrar: (datos?: Partial<typeof REGISTRO>) => Promise<Respuesta>;
  cerrar: () => Promise<void>;
}

export interface Respuesta {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  texto: string;
  tipo: string;
  /** cabeceras de la respuesta */
  cabeceras: Headers;
  /** `nombre=valor` de la cookie que puso la respuesta, sin atributos */
  cookie: string | null;
}

export const SECRETO_PRUEBA = "t".repeat(40);

/** Una empresa válida para registrarse (el RUC y la contraseña pasan las validaciones). */
export const REGISTRO = {
  empresa: "Empresa de Prueba S.A.", ruc: "1790000028001", email: "prueba@empresa.com", clave: "clave-de-prueba-1",
};

/**
 * Levanta la API en un puerto libre con una base Postgres en memoria (PGlite), para una prueba.
 * Por defecto registra una empresa y deja la sesión abierta en ella: es la cuenta 2 (la 1 es la
 * plantilla de ley), así que sus datos de partida tienen ids conocidos (ver `PUESTO_AUXILIAR`).
 * Con `sinSesion` empieza sin ninguna empresa registrada.
 */
export async function iniciar(opciones: { sinSesion?: boolean } = {}): Promise<Cliente> {
  const db = await abrirBase(":memory:");
  const app = crearApp(db, { secreto: SECRETO_PRUEBA });
  const servidor = await new Promise<ReturnType<typeof app.listen>>((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  let cookieActual: string | null = null;
  const pedir = async (metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta> => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookieActual ? { Cookie: cookieActual } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* respuestas que no son JSON (CSV, 204) */
    }
    return {
      status: r.status, json, texto, tipo: r.headers.get("content-type") ?? "", cabeceras: r.headers,
      cookie: r.headers.getSetCookie()[0]?.split(";")[0] ?? null,
    };
  };

  const cliente: Cliente = {
    db,
    get: (ruta) => pedir("GET", ruta),
    post: (ruta, cuerpo = {}) => pedir("POST", ruta, cuerpo),
    put: (ruta, cuerpo = {}) => pedir("PUT", ruta, cuerpo),
    patch: (ruta, cuerpo) => pedir("PATCH", ruta, cuerpo),
    del: (ruta) => pedir("DELETE", ruta),
    usarCookie: (cookie) => {
      cookieActual = cookie;
    },
    registrar: async (datos = {}) => {
      cookieActual = null;
      const r = await pedir("POST", "/api/auth/registro", { ...REGISTRO, ...datos });
      if (r.status === 201) cookieActual = r.cookie;
      return r;
    },
    cerrar: async () => {
      servidor.close();
      await db.cerrar();
    },
  };
  if (!opciones.sinSesion) {
    const r = await cliente.registrar();
    if (r.status !== 201) throw new Error(`No se pudo registrar la empresa de prueba: ${r.texto}`);
  }
  return cliente;
}

/** Cuántos grados de escala y puestos trae la plantilla: la primera empresa recibe su copia a continuación. */
export const GRADOS_PLANTILLA = 33;
export const PUESTOS_PLANTILLA = 5;

/** Id del grado `n` (1 a 33, en el orden de la plantilla) de la primera empresa registrada. */
export const grado = (n: number) => GRADOS_PLANTILLA + n;

/** Id del puesto `n` (1 a 5: gerente, administrador, supervisor, operaciones, auxiliar) de la primera empresa. */
export const puesto = (n: number) => PUESTOS_PLANTILLA + n;

/** Nivel E2 (mínimo $482) de la escala del Código del Trabajo: el último que siembra la migración 007. */
export const NIVEL_E2_CT = grado(GRADOS_PLANTILLA);

/** Puesto "Auxiliar de guardalmacén" del orgánico de ejemplo (nivel E2). */
export const PUESTO_AUXILIAR = puesto(5);

/** Empleado válido del Código del Trabajo: exige un puesto del orgánico y su nivel (el sueldo puede superar el mínimo). */
export const EMPLEADO = {
  cedula: "1801234566", nombres: "Ana Prueba", cargo: "Analista",
  sueldoBase: 1000, fechaIngreso: "2024-01-10", tipoContrato: "Indefinido", escalaId: NIVEL_E2_CT,
  puestoId: PUESTO_AUXILIAR,
};

/**
 * Los seis empleados con los que están calculadas a mano las pruebas de roles, IESS y regímenes:
 * 1 y 2 y 4 = Código del Trabajo, 3 = LOSEP, 5 = LOEP servidor, 6 = LOEP obrero.
 * Se crean por la API (con su puesto o grado), en este orden, para que sus ids sean del 1 al 6.
 */
export async function cargarEmpleadosDePrueba(api: Cliente) {
  const losep = (await api.get("/api/escala?regimen=LOSEP")).json;
  const gradoLosep = (n: number) => losep.find((g: { grado: number }) => g.grado === n).id;
  const base = { tipoContrato: "Indefinido", regimen: "CODIGO_TRABAJO" };
  const empleados = [
    { ...base, cedula: "1801234566", nombres: "María Fernanda Paredes", cargo: "Gerente General", sueldoBase: 4500, fechaIngreso: "2019-03-01", puestoId: puesto(1) },
    { ...base, cedula: "1702345677", nombres: "Carlos Andrés Villacís", cargo: "Contador", sueldoBase: 1800, fechaIngreso: "2022-07-15", puestoId: puesto(2) },
    { ...base, cedula: "0903456788", nombres: "Lucía Estefanía Mora", cargo: "Asistente Administrativa", sueldoBase: 675, fechaIngreso: "2024-02-01", tipoContrato: "Plazo fijo", regimen: "LOSEP", escalaId: gradoLosep(5) },
    { ...base, cedula: "0104567896", nombres: "José Luis Camacho", cargo: "Vendedor", sueldoBase: 900, fechaIngreso: "2025-11-03", puestoId: puesto(3) },
    { ...base, cedula: "1715678908", nombres: "Daniela Alejandra Ruiz", cargo: "Analista de Sistemas", sueldoBase: 2670, fechaIngreso: "2023-05-10", regimen: "LOEP", categoriaLoep: "servidor", escalaId: gradoLosep(19) },
    { ...base, cedula: "0606789014", nombres: "Pedro Pablo Guamán", cargo: "Bodeguero", sueldoBase: 482, fechaIngreso: "2026-10-16", tipoContrato: "Eventual", regimen: "LOEP", categoriaLoep: "obrero", puestoId: PUESTO_AUXILIAR },
  ];
  for (const e of empleados) {
    const r = await api.post("/api/empleados", e);
    if (r.status !== 201) throw new Error(`No se pudo crear a ${e.nombres}: ${JSON.stringify(r.json)}`);
  }
}
