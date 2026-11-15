/**
 * Reliquidación: corregir un rol ya publicado sin tocarlo (migración 017).
 *
 * Se crea un rol de «ajuste» vinculado al original. Se recalcula el mes con lo que valía ese mes (las
 * reglas vigentes a su cierre) y los datos que tenía cada empleado en el rol, más los cambios pedidos.
 * El ajuste guarda solo la diferencia contra lo ya publicado, así que sumar el rol original y sus ajustes
 * da lo que realmente corresponde al mes.
 */
import { Decimal } from "decimal.js";

import { registrarAuditoria } from "./auditoria.ts";
import type { ResultadoRol } from "./calculos.ts";
import { consultar, esDuplicado, insertar, transaccion, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { calcularMes, CAMPOS_NOVEDAD, insertarDetalle, totalDe } from "./nomina.ts";
import type { Novedad } from "./nomina.ts";
import { aDecimal, ErrorApi } from "./validaciones.ts";

/** Lo que un ajuste guarda como diferencia: dinero y horas. El resto del detalle lleva su valor nuevo. */
export const CAMPOS_DIFERENCIA = [
  "horasSuplementarias", "horasExtraordinarias", "horasDescanso", "horasNocturnas", "sueldo",
  "valorHorasSuplementarias", "valorHorasExtraordinarias", "valorHorasDescanso", "valorRecargoNocturno",
  "comisiones", "ingresosAportables", "beneficiosMensuales", "totalIngresos", "aporteIess", "impuestoRenta",
  "otrosDescuentos", "descuentoPrestamos", "totalDescuentos", "netoPagar", "decimoTercero", "decimoCuarto", "fondosReserva",
  "vacaciones", "aportePatronal", "totalProvisiones", "costoEmpleador",
] as const satisfies readonly (keyof ResultadoRol)[];

const snake = (camel: string) => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const COLUMNAS_DIFERENCIA = new Set<string>(CAMPOS_DIFERENCIA.map(snake));

/**
 * Cómo quedó cada empleado del mes: su fila del rol original con todos los ajustes ya publicados
 * sumados. Es la base contra la que se calcula el siguiente ajuste.
 */
export async function detalleVigente(db: Base, origenId: number): Promise<Fila[]> {
  const origen = await consultar(db, "SELECT * FROM roles_detalle WHERE rol_id = ? ORDER BY nombres", origenId);
  const ajustes = await consultar(
    db,
    `SELECT d.* FROM roles_detalle d JOIN roles_cabecera c ON c.id = d.rol_id
     WHERE c.rol_origen_id = ? AND c.estado IN ('publicado', 'pagado') ORDER BY c.id, d.nombres`,
    origenId,
  );
  // La cédula identifica al empleado aunque luego lo eliminen (el detalle conserva su foto).
  const porCedula = new Map<string, Fila>(origen.map((f) => [String(f.cedula), { ...f }]));
  for (const a of ajustes) {
    const base = porCedula.get(String(a.cedula));
    if (!base) continue;
    for (const [columna, valor] of Object.entries(a)) {
      if (columna === "id" || columna === "rol_id") continue;
      base[columna] = COLUMNAS_DIFERENCIA.has(columna)
        ? new Decimal(Number(base[columna])).plus(Number(valor)).toNumber()
        : valor;
    }
  }
  return [...porCedula.values()];
}

export interface CambioDeEmpleado {
  cedula: string;
  sueldoBase?: unknown;
  horasSuplementarias?: unknown;
  horasExtraordinarias?: unknown;
  horasDescanso?: unknown;
  horasNocturnas?: unknown;
  comisiones?: unknown;
  otrosDescuentos?: unknown;
}

const vacio = (v: unknown) => v === undefined || v === null || v === "";

/** Crea el ajuste de un rol publicado o pagado. Devuelve su id y los avisos del cálculo. */
export async function reliquidar(
  db: Base, cuentaId: number, usuarioId: number | null, origenId: number, motivo: unknown, cambios: unknown,
): Promise<{ rolId: number; empleados: number; avisos: string[] }> {
  const errores: string[] = [];
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (texto.length < 5 || texto.length > 500) errores.push("Motivo: explica en 5 a 500 caracteres por qué se corrige el rol.");

  const origen = await uno(db, "SELECT * FROM roles_cabecera WHERE cuenta_id = ? AND id = ?", cuentaId, origenId);
  if (!origen) throw new ErrorApi(404, ["El rol no existe."]);
  if (origen.tipo !== "ordinario") throw new ErrorApi(409, ["Un ajuste no se reliquida: reliquida el rol del mes."]);
  if (origen.estado !== "publicado" && origen.estado !== "pagado") {
    throw new ErrorApi(409, [`El rol está «${origen.estado}»: mientras no se publique se corrige recalculándolo, no con un ajuste.`]);
  }
  const abierto = await uno(
    db, "SELECT id FROM roles_cabecera WHERE rol_origen_id = ? AND estado NOT IN ('publicado', 'pagado')", origenId,
  );
  if (abierto) throw new ErrorApi(409, [`Ya hay un ajuste sin publicar (rol ${abierto.id}): publícalo o elimínalo antes de crear otro.`]);

  const anio = Number(origen.anio);
  const mes = Number(origen.mes);
  const vigente = await detalleVigente(db, origenId);
  const pedidos = new Map<string, CambioDeEmpleado>();
  for (const c of Array.isArray(cambios) ? (cambios as CambioDeEmpleado[]) : []) {
    const cedula = String(c?.cedula ?? "");
    if (!vigente.some((v) => String(v.cedula) === cedula)) errores.push(`La cédula ${cedula || "(vacía)"} no está en este rol.`);
    else pedidos.set(cedula, c);
  }

  // Los datos del empleado son los que tenía en el rol; solo cambia lo que se pide.
  const actuales = new Map(
    (await consultar(db, "SELECT * FROM empleados WHERE cuenta_id = ?", cuentaId)).map((e) => [String(e.cedula), e]),
  );
  const novedades = new Map<number, Novedad>();
  const entradas = vigente.map((v, i) => {
    const cedula = String(v.cedula);
    const cambio = pedidos.get(cedula);
    const actual = actuales.get(cedula);
    const clave = i + 1; // el empleado puede haberse eliminado: la clave del cálculo no depende de su id
    const valor = (campo: keyof CambioDeEmpleado, base: unknown, minimo = 0) => {
      const pedido = cambio?.[campo];
      if (vacio(pedido)) return new Decimal(Number(base));
      try {
        return aDecimal(pedido, minimo);
      } catch (error) {
        errores.push(`${v.nombres}: ${(error as Error).message}.`);
        return new Decimal(0);
      }
    };
    novedades.set(clave, Object.fromEntries(CAMPOS_NOVEDAD.map((campo) => [
      campo, valor(campo, v[snake(campo)]),
    ])) as Novedad);
    const sueldoBase = valor("sueldoBase", v.sueldo_base, 0.01);
    const pagaExtras = Number(v.horas_suplementarias) + Number(v.horas_extraordinarias) + Number(v.horas_descanso) > 0;
    return {
      e: {
        id: clave, cedula: v.cedula, nombres: v.nombres, cargo: v.cargo, sueldo_base: sueldoBase.toNumber(),
        fecha_ingreso: v.fecha_ingreso, regimen: v.regimen, categoria_loep: null,
        fecha_salida: actual?.fecha_salida ?? null,
        pago_decimo_tercero: v.decimo_tercero_modalidad, pago_decimo_cuarto: v.decimo_cuarto_modalidad,
        pago_fondos_reserva: v.fondos_reserva_modalidad,
        gastos_personales: v.gastos_personales, cargas_familiares: v.cargas_familiares,
        enfermedad_catastrofica: v.enfermedad_catastrofica,
        recibe_horas_extras: pagaExtras ? 1 : (actual?.recibe_horas_extras ?? null),
      } as Fila,
      aplicadoCodigo: String(v.regimen_aplicado),
      // Un ajuste no vuelve a buscar los préstamos: conserva lo que se descontó en el rol del mes.
      prestamos: new Decimal(Number(v.descuento_prestamos ?? 0)),
    };
  });
  if (errores.length) throw new ErrorApi(400, errores);

  const { calculos, avisos } = await calcularMes(db, cuentaId, anio, mes, entradas, novedades);

  // Contra lo ya publicado: solo quedan los empleados cuyo resultado cambia, y con la diferencia.
  const diferencias = calculos.flatMap((c, i) => {
    const base = vigente[i];
    const ajustado: Record<string, unknown> = { ...c.resultado };
    let cambia = false;
    for (const campo of CAMPOS_DIFERENCIA) {
      const diferencia = new Decimal(c.resultado[campo]).minus(Number(base[snake(campo)])).toDecimalPlaces(6).toNumber();
      ajustado[campo] = diferencia;
      if (diferencia !== 0) cambia = true;
    }
    // La traza explica el cálculo completo del mes con los cambios; el detalle guarda solo la diferencia.
    const traza = { ...c.traza, contexto: { ...c.traza.contexto, ajuste: true } };
    return cambia ? [{ ...c, traza, resultado: ajustado as unknown as ResultadoRol, empleadoId: base.empleado_id as number | null }] : [];
  });
  if (!diferencias.length) throw new ErrorApi(400, ["Con esos cambios el rol no varía: no hay nada que ajustar."]);

  const rolId = await transaccion(db, async (tx) => {
    let nuevoId: number;
    try {
      nuevoId = await insertar(
        tx,
        `INSERT INTO roles_cabecera (cuenta_id, anio, mes, generado_en, num_empleados, total_ingresos,
         total_descuentos, total_neto, total_provisiones, total_costo, generado_por, tipo, rol_origen_id, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ajuste', ?, ?)`,
        cuentaId, anio, mes, new Date().toISOString().slice(0, 19), diferencias.length,
        totalDe(diferencias, "totalIngresos"), totalDe(diferencias, "totalDescuentos"), totalDe(diferencias, "netoPagar"),
        totalDe(diferencias, "totalProvisiones"), totalDe(diferencias, "costoEmpleador"), usuarioId, origenId, texto,
      );
    } catch (error) {
      if (esDuplicado(error)) throw new ErrorApi(409, ["Ya hay un ajuste sin publicar para este rol."]);
      throw error;
    }
    for (const d of diferencias) await insertarDetalle(tx, nuevoId, d, d.empleadoId);
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: "rol.calculado", entidad: "rol", entidadId: nuevoId,
      detalle: { tipo: "ajuste", origen: origenId, motivo: texto, empleados: diferencias.length, neto: totalDe(diferencias, "netoPagar") },
    });
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: "rol.ajuste_creado", entidad: "rol", entidadId: origenId,
      detalle: { ajuste: nuevoId, motivo: texto },
    });
    return nuevoId;
  });
  return { rolId, empleados: diferencias.length, avisos };
}
