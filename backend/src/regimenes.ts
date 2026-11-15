/** Regímenes laborales guardados en la base y las reglas que de ellos salen. */
import { MODALIDADES, REGLAS_CT_2026 } from "./calculos.ts";
import type { Modalidad, OpcionesRol, ReglasRol } from "./calculos.ts";
import { registrarAuditoria } from "./auditoria.ts";
import { consultar, ejecutar, transaccion, uno } from "./db.ts";
import type { Base, Fila, Valor } from "./db.ts";
import type { ParametrosAnio } from "./parametros.ts";
import { ErrorApi, fechaIsoValida } from "./validaciones.ts";

export const CATEGORIAS_LOEP = ["servidor", "obrero"] as const;
export type CategoriaLoep = (typeof CATEGORIAS_LOEP)[number];

export interface Regimen {
  codigo: string;
  /** Primer día (AAAA-MM-DD) en que rige esta versión de las reglas. */
  vigenteDesde: string;
  nombre: string;
  descripcion: string;
  baseLegal: string;
  tipo: "reglas" | "mixto";
  regimenServidor: string | null;
  regimenObrero: string | null;
  iessPersonal: number | null;
  iessPatronal: number | null;
  recargoSuplementarias: number | null;
  recargoExtraordinarias: number | null;
  recargoDescanso: number | null;
  recargoNocturno: number | null;
  topeSuplementariasMes: number | null;
  topeExtraordinariasMes: number | null;
  diasVacaciones: number | null;
  fondosReserva: number | null;
  mesesParaFondos: number | null;
  aplicaDecimoTercero: boolean;
  aplicaDecimoCuarto: boolean;
  aplicaFondosReserva: boolean;
  aplicaHorasExtras: boolean;
  verificado: boolean;
  notas: string;
}

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function aRegimen(f: Fila): Regimen {
  return {
    codigo: String(f.codigo),
    vigenteDesde: String(f.vigente_desde),
    nombre: String(f.nombre),
    descripcion: String(f.descripcion),
    baseLegal: String(f.base_legal),
    tipo: f.tipo === "mixto" ? "mixto" : "reglas",
    regimenServidor: f.regimen_servidor === null ? null : String(f.regimen_servidor),
    regimenObrero: f.regimen_obrero === null ? null : String(f.regimen_obrero),
    iessPersonal: numero(f.iess_personal),
    iessPatronal: numero(f.iess_patronal),
    recargoSuplementarias: numero(f.recargo_suplementarias),
    recargoExtraordinarias: numero(f.recargo_extraordinarias),
    recargoDescanso: numero(f.recargo_descanso),
    recargoNocturno: numero(f.recargo_nocturno),
    topeSuplementariasMes: numero(f.tope_suplementarias_mes),
    topeExtraordinariasMes: numero(f.tope_extraordinarias_mes),
    diasVacaciones: numero(f.dias_vacaciones),
    fondosReserva: numero(f.fondos_reserva),
    mesesParaFondos: numero(f.meses_para_fondos),
    aplicaDecimoTercero: f.aplica_decimo_tercero === 1,
    aplicaDecimoCuarto: f.aplica_decimo_cuarto === 1,
    aplicaFondosReserva: f.aplica_fondos_reserva === 1,
    aplicaHorasExtras: f.aplica_horas_extras === 1,
    verificado: f.verificado === 1,
    notas: String(f.notas),
  };
}

/** Hoy en Ecuador (AAAA-MM-DD), sin depender de la zona horaria del servidor. */
export const hoyEnEcuador = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });

/**
 * Fecha con la que se eligen las reglas de un rol: el último día de su mes. Una regla que empieza a
 * regir en cualquier día del mes ya cuenta para el rol de ese mes.
 */
export function fechaDeCierre(anio: number, mes: number): string {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/**
 * La versión de cada régimen que rige en una fecha (por defecto hoy): la más reciente que ya empezó.
 * Si la fecha es anterior a todas las versiones, se usa la más antigua.
 */
const VIGENTE_EN_FECHA = `
  SELECT r.* FROM regimenes r
  WHERE r.cuenta_id = ? AND r.vigente_desde = COALESCE(
    (SELECT MAX(v.vigente_desde) FROM regimenes v
     WHERE v.cuenta_id = r.cuenta_id AND v.codigo = r.codigo AND v.vigente_desde <= ?),
    (SELECT MIN(v.vigente_desde) FROM regimenes v WHERE v.cuenta_id = r.cuenta_id AND v.codigo = r.codigo))`;

export async function listarRegimenes(db: Base, cuentaId: number, fecha = hoyEnEcuador()): Promise<Regimen[]> {
  return (await consultar(
    db,
    `${VIGENTE_EN_FECHA} ORDER BY CASE r.codigo WHEN 'CODIGO_TRABAJO' THEN 0 ELSE 1 END, r.nombre`,
    cuentaId, fecha,
  )).map(aRegimen);
}

export async function buscarRegimen(
  db: Base, cuentaId: number, codigo: string, fecha = hoyEnEcuador(),
): Promise<Regimen | undefined> {
  const fila = await uno(db, `${VIGENTE_EN_FECHA} AND r.codigo = ?`, cuentaId, fecha, codigo);
  return fila ? aRegimen(fila) : undefined;
}

/** Todas las versiones de un régimen, la más reciente primero. */
export async function versionesDeRegimen(db: Base, cuentaId: number, codigo: string): Promise<Regimen[]> {
  return (await consultar(
    db, "SELECT * FROM regimenes WHERE cuenta_id = ? AND codigo = ? ORDER BY vigente_desde DESC", cuentaId, codigo,
  )).map(aRegimen);
}

/**
 * El régimen cuyas reglas se aplican. Para uno mixto (LOEP) lo decide la categoría:
 * el servidor sigue el régimen de servidores y el obrero el de obreros.
 */
export function regimenAplicado(
  regimenes: ReadonlyMap<string, Regimen>, codigo: string, categoria: string | null,
): Regimen {
  const elegido = regimenes.get(codigo);
  if (!elegido) throw new ErrorApi(400, [`El régimen '${codigo}' no existe.`]);
  if (elegido.tipo !== "mixto") return elegido;
  const destino = categoria === "obrero" ? elegido.regimenObrero : categoria === "servidor" ? elegido.regimenServidor : null;
  const aplicado = destino ? regimenes.get(destino) : undefined;
  if (!aplicado || aplicado.tipo === "mixto") {
    throw new ErrorApi(400, [`${elegido.nombre} necesita la categoría 'servidor' u 'obrero' del empleado.`]);
  }
  return aplicado;
}

export const indexarRegimenes = (lista: Regimen[]) => new Map(lista.map((r) => [r.codigo, r]));

/** Reglas del motor: SBU y tabla del IR salen del año; el resto, del régimen. */
export function reglasDe(parametros: ParametrosAnio, regimen: Regimen): ReglasRol {
  if (regimen.tipo !== "reglas") throw new Error(`${regimen.codigo} no tiene reglas propias`);
  const dato = (valor: number | null, nombre: string): number => {
    if (valor === null) throw new Error(`Al régimen ${regimen.codigo} le falta '${nombre}'`);
    return valor;
  };
  return {
    sbu: parametros.sbu,
    canastaBasica: parametros.canastaBasica,
    tablaIr: parametros.tablaIr,
    horasMes: REGLAS_CT_2026.horasMes,
    iessPersonal: dato(regimen.iessPersonal, "aporte personal"),
    iessPatronal: dato(regimen.iessPatronal, "aporte patronal"),
    fondosReserva: dato(regimen.fondosReserva, "fondos de reserva"),
    mesesParaFondos: dato(regimen.mesesParaFondos, "meses para fondos"),
    diasVacaciones: dato(regimen.diasVacaciones, "días de vacaciones"),
    recargoSuplementarias: dato(regimen.recargoSuplementarias, "recargo suplementarias"),
    recargoExtraordinarias: dato(regimen.recargoExtraordinarias, "recargo extraordinarias"),
    recargoDescanso: dato(regimen.recargoDescanso, "recargo de descanso"),
    recargoNocturno: dato(regimen.recargoNocturno, "recargo nocturno"),
    topeSuplementariasMes: regimen.topeSuplementariasMes,
    topeExtraordinariasMes: regimen.topeExtraordinariasMes,
  };
}

/**
 * Cómo recibe cada beneficio un empleado. Lo que el empleado tiene escrito manda; si lo dejó
 * vacío, vale el régimen: si lo concede se paga cada mes en el rol (lo que manda la ley por
 * defecto) y si no lo concede, no se recibe.
 */
export function opcionesDe(
  aplicado: Regimen,
  empleado: { pago_decimo_tercero?: unknown; pago_decimo_cuarto?: unknown; pago_fondos_reserva?: unknown; recibe_horas_extras?: unknown },
): OpcionesRol {
  const elegida = (valor: unknown, concede: boolean): Modalidad =>
    MODALIDADES.includes(valor as Modalidad) ? (valor as Modalidad) : concede ? "mensual" : "no";
  return {
    decimoTercero: elegida(empleado.pago_decimo_tercero, aplicado.aplicaDecimoTercero),
    decimoCuarto: elegida(empleado.pago_decimo_cuarto, aplicado.aplicaDecimoCuarto),
    fondosReserva: elegida(empleado.pago_fondos_reserva, aplicado.aplicaFondosReserva),
    recibeHorasExtras:
      empleado.recibe_horas_extras === null || empleado.recibe_horas_extras === undefined
        ? aplicado.aplicaHorasExtras
        : empleado.recibe_horas_extras === 1,
  };
}

// --- Edición ----------------------------------------------------------------

type Cuerpo = Record<string, unknown>;

/**
 * Valida y guarda los cambios de un régimen; devuelve la versión que quedó.
 *
 * `vigenteDesde` dice desde cuándo rigen estas reglas. Si ya hay una versión con esa fecha se corrige;
 * si no, se crea una nueva a partir de la que regía ese día, y las anteriores quedan intactas (los
 * meses viejos se siguen calculando con lo que valía entonces). Sin `vigenteDesde` se corrige en el
 * sitio la versión que rige hoy. `usuarioId` es quien lo pidió, para la auditoría.
 */
export async function actualizarRegimen(
  db: Base, cuentaId: number, codigo: string, cuerpo: Cuerpo, usuarioId: number | null = null,
): Promise<Regimen> {
  const errores: string[] = [];

  let pedida: string | null = null;
  if (cuerpo.vigenteDesde !== undefined && cuerpo.vigenteDesde !== null && cuerpo.vigenteDesde !== "") {
    const fecha = cuerpo.vigenteDesde;
    if (!fechaIsoValida(fecha) || fecha < "2000-01-01" || fecha > "2100-12-31") {
      throw new ErrorApi(400, ["Vigente desde: escribe una fecha válida (AAAA-MM-DD) entre 2000 y 2100."]);
    }
    pedida = fecha;
  }
  const actual = await buscarRegimen(db, cuentaId, codigo, pedida ?? undefined);
  if (!actual) throw new ErrorApi(404, ["El régimen no existe."]);
  const desde = pedida ?? actual.vigenteDesde;
  const crea = desde !== actual.vigenteDesde;

  const rango = (campo: string, etiqueta: string, min: number, max: number, entero = false): number | null => {
    const valor = cuerpo[campo];
    const n = Number(valor);
    if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) {
      errores.push(`${etiqueta}: debe ser ${entero ? "un entero" : "un número"} entre ${min} y ${max}.`);
      return null;
    }
    return n;
  };
  const tope = (campo: string, etiqueta: string): number | null => {
    const valor = cuerpo[campo];
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 744) {
      errores.push(`${etiqueta}: déjalo vacío (sin tope) o escribe un número entre 0 y 744.`);
      return null;
    }
    return n;
  };
  const bool = (campo: string) => (cuerpo[campo] === true || cuerpo[campo] === 1 ? 1 : 0);
  const texto = (campo: string, max: number) => String(cuerpo[campo] ?? "").trim().slice(0, max);

  const nombre = texto("nombre", 120);
  if (!nombre) errores.push("El nombre es obligatorio.");
  const verificado = bool("verificado");
  const notas = texto("notas", 1000);

  /** Guarda en la versión `desde` (creándola antes si es nueva) y deja constancia, todo en una transacción. */
  const guardar = (cambios: string, ...valores: Valor[]) => transaccion(db, async (tx) => {
    if (crea) {
      await ejecutar(
        tx,
        `INSERT INTO regimenes (cuenta_id, codigo, vigente_desde, nombre, descripcion, base_legal, tipo, regimen_servidor,
           regimen_obrero, iess_personal, iess_patronal, recargo_suplementarias, recargo_extraordinarias,
           recargo_descanso, recargo_nocturno, tope_suplementarias_mes, tope_extraordinarias_mes, dias_vacaciones,
           fondos_reserva, meses_para_fondos, aplica_decimo_tercero, aplica_decimo_cuarto, aplica_fondos_reserva,
           aplica_horas_extras, verificado, notas)
         SELECT cuenta_id, codigo, ?, nombre, descripcion, base_legal, tipo, regimen_servidor,
           regimen_obrero, iess_personal, iess_patronal, recargo_suplementarias, recargo_extraordinarias,
           recargo_descanso, recargo_nocturno, tope_suplementarias_mes, tope_extraordinarias_mes, dias_vacaciones,
           fondos_reserva, meses_para_fondos, aplica_decimo_tercero, aplica_decimo_cuarto, aplica_fondos_reserva,
           aplica_horas_extras, verificado, notas
         FROM regimenes WHERE cuenta_id = ? AND codigo = ? AND vigente_desde = ?`,
        desde, cuentaId, codigo, actual.vigenteDesde,
      );
    }
    await ejecutar(
      tx, `UPDATE regimenes SET ${cambios} WHERE cuenta_id = ? AND codigo = ? AND vigente_desde = ?`,
      ...valores, cuentaId, codigo, desde,
    );
    // Los cambios a las reglas de ley no tienen un id numérico: el régimen y la fecha van en el detalle.
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: crea ? "regimen.version_creada" : "regimen.corregido", entidad: "regimen", entidadId: 0,
      detalle: { codigo, vigenteDesde: desde, ...(crea ? { copiadaDe: actual.vigenteDesde } : {}) },
    });
  });

  if (actual.tipo === "mixto") {
    const destinos = new Map((await listarRegimenes(db, cuentaId, desde)).map((r) => [r.codigo, r]));
    const valido = (campo: string, etiqueta: string) => {
      const d = String(cuerpo[campo] ?? "");
      if (destinos.get(d)?.tipo !== "reglas") errores.push(`${etiqueta}: elige un régimen con reglas propias.`);
      return d;
    };
    const servidor = valido("regimenServidor", "Régimen de los servidores");
    const obrero = valido("regimenObrero", "Régimen de los obreros");
    if (errores.length) throw new ErrorApi(400, errores);
    await guardar("nombre = ?, regimen_servidor = ?, regimen_obrero = ?, verificado = ?, notas = ?",
      nombre, servidor, obrero, verificado, notas);
    return (await buscarRegimen(db, cuentaId, codigo, desde))!;
  }

  const iessPersonal = rango("iessPersonal", "Aporte personal al IESS", 0, 1);
  const iessPatronal = rango("iessPatronal", "Aporte patronal al IESS", 0, 1);
  const recSup = rango("recargoSuplementarias", "Recargo de horas suplementarias", 0, 5);
  const recExt = rango("recargoExtraordinarias", "Recargo de horas extraordinarias", 0, 5);
  const recDes = rango("recargoDescanso", "Recargo de sábados, domingos y feriados", 0, 5);
  const recNoc = rango("recargoNocturno", "Recargo nocturno", 0, 5);
  const dias = rango("diasVacaciones", "Días de vacaciones", 0, 90, true);
  const fondos = rango("fondosReserva", "Fondos de reserva", 0, 1);
  const meses = rango("mesesParaFondos", "Meses para fondos de reserva", 0, 120, true);
  const topeSup = tope("topeSuplementariasMes", "Tope de horas suplementarias");
  const topeExt = tope("topeExtraordinariasMes", "Tope de horas extraordinarias");
  if (errores.length) throw new ErrorApi(400, errores);

  await guardar(
    `nombre = ?, iess_personal = ?, iess_patronal = ?, recargo_suplementarias = ?,
       recargo_extraordinarias = ?, recargo_descanso = ?, recargo_nocturno = ?, tope_suplementarias_mes = ?,
       tope_extraordinarias_mes = ?, dias_vacaciones = ?, fondos_reserva = ?, meses_para_fondos = ?,
       aplica_decimo_tercero = ?, aplica_decimo_cuarto = ?, aplica_fondos_reserva = ?, aplica_horas_extras = ?,
       verificado = ?, notas = ?`,
    nombre, iessPersonal, iessPatronal, recSup, recExt, recDes, recNoc, topeSup, topeExt, dias, fondos, meses,
    bool("aplicaDecimoTercero"), bool("aplicaDecimoCuarto"), bool("aplicaFondosReserva"), bool("aplicaHorasExtras"),
    verificado, notas,
  );
  return (await buscarRegimen(db, cuentaId, codigo, desde))!;
}

/** Elimina una versión (por ejemplo una fecha mal puesta). La única que queda de un régimen no se puede quitar. */
export async function eliminarVersionDeRegimen(
  db: Base, cuentaId: number, codigo: string, desde: string, usuarioId: number | null = null,
): Promise<void> {
  const versiones = await versionesDeRegimen(db, cuentaId, codigo);
  if (!versiones.some((v) => v.vigenteDesde === desde)) throw new ErrorApi(404, ["Esa versión del régimen no existe."]);
  if (versiones.length === 1) throw new ErrorApi(409, ["No se puede eliminar la única versión del régimen."]);
  await transaccion(db, async (tx) => {
    await ejecutar(tx, "DELETE FROM regimenes WHERE cuenta_id = ? AND codigo = ? AND vigente_desde = ?", cuentaId, codigo, desde);
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: "regimen.version_eliminada", entidad: "regimen", entidadId: 0,
      detalle: { codigo, vigenteDesde: desde },
    });
  });
}
