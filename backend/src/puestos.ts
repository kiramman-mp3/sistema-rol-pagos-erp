/** Orgánico funcional: puestos con su función, responsabilidad, sector y referencia salarial. */
import { consultar, ejecutar, esDuplicado, filaACamel, insertar, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { buscarGrado, listarEscala } from "./escala.ts";
import type { Grado } from "./escala.ts";
import { ErrorApi, esId } from "./validaciones.ts";

export interface Puesto {
  id: number;
  nombre: string;
  superiorId: number | null;
  funcion: string;
  responsabilidad: string;
  sector: string;
  escalaId: number | null;
  /** nivel de la escala salarial que sirve de referencia, con su régimen */
  referencia: Grado | null;
  /** cuántos empleados ocupan el puesto */
  empleados: number;
  /** quién encabeza el puesto, si se le asignó un responsable */
  responsable: Persona | null;
  /** los empleados activos que ocupan el puesto: de ellos sale el responsable */
  ocupantes: Persona[];
}

export interface Persona {
  id: number;
  nombres: string;
}

const aPersona = (f: Fila): Persona => ({ id: Number(f.id), nombres: String(f.nombres) });

/** Arma el puesto con lo que ya se consultó: sus ocupantes activos, cuántos empleados lo ocupan y su grado. */
function armarPuesto(f: Fila, ocupantes: Persona[], empleados: number, referencia: Grado | null): Puesto {
  const { responsableId, cuentaId: _cuenta, ...base } = filaACamel(f) as unknown as Puesto & {
    responsableId: number | null; cuentaId: number;
  };
  return { ...base, referencia, empleados, responsable: ocupantes.find((o) => o.id === responsableId) ?? null, ocupantes };
}

/** Todos los puestos de la cuenta con cuatro consultas, sin importar cuántos haya (no una o tres por puesto). */
export async function listarPuestos(db: Base, cuentaId: number): Promise<Puesto[]> {
  const filas = await consultar(db, "SELECT * FROM puestos WHERE cuenta_id = ? ORDER BY id", cuentaId);
  const ocupantes = new Map<number, Persona[]>();
  for (const o of await consultar(
    db,
    "SELECT id, nombres, puesto_id FROM empleados WHERE cuenta_id = ? AND puesto_id IS NOT NULL AND activo = 1 ORDER BY nombres",
    cuentaId,
  )) {
    const puestoId = Number(o.puesto_id);
    ocupantes.set(puestoId, [...(ocupantes.get(puestoId) ?? []), aPersona(o)]);
  }
  const totales = new Map(
    (await consultar(
      db,
      "SELECT puesto_id, COUNT(*) AS n FROM empleados WHERE cuenta_id = ? AND puesto_id IS NOT NULL GROUP BY puesto_id",
      cuentaId,
    )).map((t) => [Number(t.puesto_id), Number(t.n)]),
  );
  const grados = new Map((await listarEscala(db, cuentaId)).map((g) => [g.id, g]));
  return filas.map((f) => armarPuesto(
    f, ocupantes.get(Number(f.id)) ?? [], totales.get(Number(f.id)) ?? 0,
    f.escala_id === null ? null : (grados.get(Number(f.escala_id)) ?? null),
  ));
}

export async function buscarPuesto(db: Base, cuentaId: number, id: number): Promise<Puesto | undefined> {
  if (!esId(id)) return undefined; // el id viene del cuerpo de una petición: puede ser NaN o enorme
  const fila = await uno(db, "SELECT * FROM puestos WHERE cuenta_id = ? AND id = ?", cuentaId, id);
  if (!fila) return undefined;
  const ocupantes = (await consultar(
    db, "SELECT id, nombres FROM empleados WHERE cuenta_id = ? AND puesto_id = ? AND activo = 1 ORDER BY nombres", cuentaId, id,
  )).map(aPersona);
  const empleados = Number(
    (await uno(db, "SELECT COUNT(*) AS n FROM empleados WHERE cuenta_id = ? AND puesto_id = ?", cuentaId, id))?.n ?? 0,
  );
  const referencia = fila.escala_id === null ? null : ((await buscarGrado(db, cuentaId, Number(fila.escala_id))) ?? null);
  return armarPuesto(fila, ocupantes, empleados, referencia);
}

/** ¿Algún puesto del orgánico tiene como referencia un grado de la escala de este régimen? */
export async function hayPuestosDelRegimen(db: Base, cuentaId: number, regimen: string): Promise<boolean> {
  return (await uno(
    db,
    "SELECT 1 AS ok FROM puestos p JOIN escala_salarial e ON e.id = p.escala_id WHERE p.cuenta_id = ? AND e.regimen = ? LIMIT 1",
    cuentaId, regimen,
  )) !== undefined;
}

interface DatosPuesto {
  nombre: string;
  superiorId: number | null;
  funcion: string;
  responsabilidad: string;
  sector: string;
  escalaId: number | null;
}

/** ¿`candidato` es `id` o está por debajo de él en el orgánico? Impide ciclos al elegir superior. */
async function cuelgaDe(db: Base, cuentaId: number, candidato: number, id: number): Promise<boolean> {
  const vistos = new Set<number>();
  let actual: number | null = candidato;
  while (actual !== null && !vistos.has(actual)) {
    if (actual === id) return true;
    vistos.add(actual);
    actual = ((await uno(db, "SELECT superior_id FROM puestos WHERE cuenta_id = ? AND id = ?", cuentaId, actual))?.superior_id as number | null) ?? null;
  }
  return false;
}

/** Valida el cuerpo de un puesto; reporta todos los problemas juntos. */
async function validarPuesto(db: Base, cuentaId: number, cuerpo: Record<string, unknown>, id?: number): Promise<DatosPuesto> {
  const errores: string[] = [];
  const texto = (campo: string) => String(cuerpo[campo] ?? "").trim();
  const nombre = texto("nombre");
  const funcion = texto("funcion");
  const responsabilidad = texto("responsabilidad");
  const sector = texto("sector");
  if (!nombre) errores.push("El nombre del puesto es obligatorio.");
  if (!funcion) errores.push("La función del puesto es obligatoria.");
  if (!responsabilidad) errores.push("La responsabilidad del puesto es obligatoria.");
  if (!sector) errores.push("El sector económico es obligatorio.");

  const vacio = (v: unknown) => v === null || v === undefined || v === "";
  let superiorId: number | null = null;
  if (!vacio(cuerpo.superiorId)) {
    superiorId = Number(cuerpo.superiorId);
    if (!(await buscarPuesto(db, cuentaId, superiorId))) errores.push("El puesto superior no existe.");
    else if (id !== undefined && (await cuelgaDe(db, cuentaId, superiorId, id))) {
      errores.push("Un puesto no puede depender de sí mismo ni de uno que depende de él.");
    }
  }

  let escalaId: number | null = null;
  if (vacio(cuerpo.escalaId)) {
    errores.push("Elige el nivel de la escala salarial que sirve de referencia.");
  } else {
    escalaId = Number(cuerpo.escalaId);
    if (!(await buscarGrado(db, cuentaId, escalaId))) errores.push("El nivel de la escala salarial no existe.");
  }

  if (errores.length) throw new ErrorApi(400, errores);
  return {
    nombre: nombre.slice(0, 100), superiorId, funcion: funcion.slice(0, 400),
    responsabilidad: responsabilidad.slice(0, 400), sector: sector.slice(0, 120), escalaId,
  };
}

/** Traduce el choque con UNIQUE(cuenta, nombre) a un 409 legible. */
async function conDuplicados<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    if (esDuplicado(error)) {
      throw new ErrorApi(409, ["Ya existe un puesto con ese nombre."]);
    }
    throw error;
  }
}

export async function crearPuesto(db: Base, cuentaId: number, cuerpo: Record<string, unknown>): Promise<Puesto> {
  const d = await validarPuesto(db, cuentaId, cuerpo);
  const id = await conDuplicados(() =>
    insertar(
      db,
      "INSERT INTO puestos (cuenta_id, nombre, superior_id, funcion, responsabilidad, sector, escala_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      cuentaId, d.nombre, d.superiorId, d.funcion, d.responsabilidad, d.sector, d.escalaId,
    ),
  );
  return (await buscarPuesto(db, cuentaId, id))!;
}

export async function actualizarPuesto(db: Base, cuentaId: number, id: number, cuerpo: Record<string, unknown>): Promise<Puesto> {
  if (!(await buscarPuesto(db, cuentaId, id))) throw new ErrorApi(404, ["El puesto no existe."]);
  const d = await validarPuesto(db, cuentaId, cuerpo, id);
  await conDuplicados(() =>
    ejecutar(
      db,
      "UPDATE puestos SET nombre = ?, superior_id = ?, funcion = ?, responsabilidad = ?, sector = ?, escala_id = ? WHERE cuenta_id = ? AND id = ?",
      d.nombre, d.superiorId, d.funcion, d.responsabilidad, d.sector, d.escalaId, cuentaId, id,
    ),
  );
  return (await buscarPuesto(db, cuentaId, id))!;
}

export async function eliminarPuesto(db: Base, cuentaId: number, id: number) {
  if (!(await buscarPuesto(db, cuentaId, id))) throw new ErrorApi(404, ["El puesto no existe."]);
  await ejecutar(db, "DELETE FROM puestos WHERE cuenta_id = ? AND id = ?", cuentaId, id);
}

/** Pone o quita (`null`) al responsable de un puesto. Solo puede serlo un empleado activo que lo ocupa. */
export async function asignarResponsable(db: Base, cuentaId: number, id: number, empleadoId: unknown): Promise<Puesto> {
  if (!(await buscarPuesto(db, cuentaId, id))) throw new ErrorApi(404, ["El puesto no existe."]);
  if (empleadoId === null || empleadoId === undefined || empleadoId === "") {
    await ejecutar(db, "UPDATE puestos SET responsable_id = NULL WHERE cuenta_id = ? AND id = ?", cuentaId, id);
  } else {
    const idEmpleado = Number(empleadoId);
    const empleado = esId(idEmpleado)
      ? await uno(db, "SELECT id, nombres, activo, puesto_id FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, idEmpleado)
      : undefined;
    if (!empleado) throw new ErrorApi(400, ["El empleado no existe."]);
    if (empleado.puesto_id !== id || empleado.activo !== 1) {
      throw new ErrorApi(400, [`${empleado.nombres} no puede ser responsable: debe ser un empleado activo que ocupe este puesto.`]);
    }
    await ejecutar(db, "UPDATE puestos SET responsable_id = ? WHERE cuenta_id = ? AND id = ?", empleado.id, cuentaId, id);
  }
  return (await buscarPuesto(db, cuentaId, id))!;
}

/** Quita a un empleado como responsable de cualquier puesto que ya no ocupa (o de todos si queda inactivo). */
export async function soltarResponsable(db: Base, cuentaId: number, empleadoId: number, puestoQueOcupa: number | null) {
  await ejecutar(
    db,
    "UPDATE puestos SET responsable_id = NULL WHERE cuenta_id = ? AND responsable_id = ? AND id IS DISTINCT FROM ?",
    cuentaId, empleadoId, puestoQueOcupa,
  );
}
