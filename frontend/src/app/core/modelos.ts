/** Formas de los datos que entrega la API (ver backend/src/rutas). */

export interface Empleado {
  id: number;
  cedula: string;
  nombres: string;
  cargo: string;
  sueldoBase: number;
  fechaIngreso: string;
  /** null = sigue en la empresa; en su mes se pagan solo los días hasta ella y luego sale del rol */
  fechaSalida: string | null;
  tipoContrato: string;
  /** Código del régimen: CODIGO_TRABAJO, LOSEP o LOEP */
  regimen: string;
  /** Solo para LOEP: 'servidor' u 'obrero' */
  categoriaLoep: string | null;
  /** Grado de la escala salarial, si el sueldo sigue una escala */
  escalaId: number | null;
  /** Puesto del orgánico funcional; el régimen que tiene puestos lo exige */
  puestoId: number | null;
  /** null = lo que diga el régimen (por defecto, se paga cada mes en el rol) */
  pagoDecimoTercero: Modalidad | null;
  pagoDecimoCuarto: Modalidad | null;
  pagoFondosReserva: Modalidad | null;
  /** null = lo que diga el régimen */
  recibeHorasExtras: boolean | null;
  activo: boolean;
  /** Solo viene al crear o editar: avisos que no bloquean el guardado. */
  avisos?: string[];
}

export type DatosEmpleado = Omit<Empleado, 'id' | 'activo' | 'avisos'>;

/** Un grado de la escala salarial con su remuneración mensual unificada. */
export interface Grado {
  id: number;
  regimen: string;
  grado: number;
  denominacion: string;
  rmu: number;
  /** Tope del rango de mínimos entre ramas (solo referencia); null si hay un solo valor */
  rmuMax: number | null;
  /** true: la remuneración es un mínimo y el sueldo puede ser mayor; false: el sueldo es exactamente ella */
  esMinimo: boolean;
  fuente: string;
}

export interface TramoIr {
  desde: number;
  hasta: number | null;
  cuota: number;
  porcentaje: number;
}

/** Cómo se recibe un beneficio: no, dentro del rol cada mes, o acumulado (provisión). */
export type Modalidad = 'no' | 'mensual' | 'acumulado';

/** Reglas de un régimen laboral. Los porcentajes son fracciones (0.0945 = 9.45%). */
export interface Regimen {
  codigo: string;
  /** Primer día (AAAA-MM-DD) en que rige esta versión de las reglas. */
  vigenteDesde: string;
  nombre: string;
  descripcion: string;
  baseLegal: string;
  /** 'mixto' remite a otros regímenes según la categoría (la LOEP) */
  tipo: 'reglas' | 'mixto';
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
  /** false = hay algo por confirmar (ver notas) */
  verificado: boolean;
  notas: string;
}

export interface Parametros {
  /** Año cuyos valores se muestran (si el pedido no tiene, el más reciente anterior) */
  anio: number;
  anioSolicitado: number;
  /** false = no hay parámetros del año pedido y se usaron los de `anio` */
  exacto: boolean;
  /** Años que tienen parámetros guardados, del más reciente al más antiguo */
  anios: number[];
  fuente: string;
  sbu: number;
  iessPersonal: number;
  iessPatronal: number;
  fondosReserva: number;
  fraccionExentaIr: number;
  tablaIr: TramoIr[];
  empresa: { nombre: string; ruc: string };
  meses: string[];
  contratos: string[];
  regimenes: Regimen[];
  categoriasLoep: string[];
}

/** La simulación agrega el régimen con que se calculó. */
export interface ResultadoSimulacion extends ResultadoRol {
  regimenAplicado: string;
  tasaIessPersonal: number;
  tasaIessPatronal: number;
}

/** Cálculo de un rol; lo comparten la simulación y cada fila del detalle. */
export interface ResultadoRol {
  diasTrabajados: number;
  mesesServicio: number;
  valorHora: number;
  sueldo: number;
  horasSuplementarias: number;
  horasExtraordinarias: number;
  horasDescanso: number;
  horasNocturnas: number;
  valorHorasSuplementarias: number;
  valorHorasExtraordinarias: number;
  valorHorasDescanso: number;
  valorRecargoNocturno: number;
  comisiones: number;
  /** Base del IESS y del impuesto: sueldo, horas extras y comisiones */
  ingresosAportables: number;
  /** Décimos y fondos de reserva pagados dentro del rol */
  beneficiosMensuales: number;
  totalIngresos: number;
  aporteIess: number;
  baseIrAnual: number;
  irAnual: number;
  impuestoRenta: number;
  otrosDescuentos: number;
  totalDescuentos: number;
  netoPagar: number;
  decimoTercero: number;
  decimoTerceroModalidad: Modalidad;
  decimoCuarto: number;
  decimoCuartoModalidad: Modalidad;
  fondosReserva: number;
  fondosReservaModalidad: Modalidad;
  vacaciones: number;
  aportePatronal: number;
  totalProvisiones: number;
  costoEmpleador: number;
}

export interface RolDetalle extends ResultadoRol {
  id: number;
  empleadoId: number | null;
  cedula: string;
  nombres: string;
  cargo: string;
  sueldoBase: number;
  fechaIngreso: string;
  regimen: string;
  regimenAplicado: string;
  tasaIessPersonal: number;
  tasaIessPatronal: number;
}

/** Ciclo del rol; publicado y pagado ya no se recalculan ni se eliminan. */
export type EstadoRol = 'calculado' | 'validado' | 'aprobado' | 'publicado' | 'pagado';

export interface RolCabecera {
  id: number;
  estado: EstadoRol;
  /** 'ajuste' corrige a un rol ordinario ya publicado: su detalle guarda solo las diferencias. */
  tipo: 'ordinario' | 'ajuste';
  rolOrigenId: number | null;
  motivo: string;
  validadoEn: string | null;
  aprobadoEn: string | null;
  publicadoEn: string | null;
  pagadoEn: string | null;
  anio: number;
  mes: number;
  generadoEn: string;
  numEmpleados: number;
  totalIngresos: number;
  totalDescuentos: number;
  totalNeto: number;
  totalProvisiones: number;
  totalCosto: number;
}

/** Aportes de un empleado en un rol, para contrastarlos con el comprobante del IESS. */
export interface FilaIess {
  cedula: string;
  nombres: string;
  regimenAplicado: string;
  diasTrabajados: number;
  materiaGravada: number;
  tasaPersonal: number;
  aportePersonal: number;
  tasaPatronal: number;
  aportePatronal: number;
  totalAportes: number;
  fondosADepositar: number;
  fondosPagadosEnRol: number;
}

export interface PlanillaIess {
  anio: number;
  mes: number;
  filas: FilaIess[];
  totales: Omit<FilaIess, 'cedula' | 'nombres' | 'regimenAplicado' | 'diasTrabajados' | 'tasaPersonal' | 'tasaPatronal'>;
}

export interface RolCompleto extends RolCabecera {
  detalle: RolDetalle[];
  /** En un ajuste: el rol que corrige. */
  origen?: { id: number; anio: number; mes: number; estado: EstadoRol } | null;
  /** En un rol publicado o pagado: sus ajustes, el total del mes con los ya publicados y cómo quedó cada empleado. */
  ajustes?: Pick<RolCabecera, 'id' | 'estado' | 'motivo' | 'generadoEn' | 'numEmpleados' | 'totalNeto'>[];
  consolidado?: { totalIngresos: number; totalDescuentos: number; totalNeto: number; totalProvisiones: number; totalCosto: number } | null;
  vigente?: RolDetalle[];
}

/** Lo que se puede corregir de un empleado al reliquidar; solo se envía lo que cambia. */
export interface CambioReliquidacion {
  cedula: string;
  sueldoBase?: string;
  horasSuplementarias?: string;
  horasExtraordinarias?: string;
  horasDescanso?: string;
  horasNocturnas?: string;
  comisiones?: string;
  otrosDescuentos?: string;
}

/** Resultado de revisar un rol: los errores bloquean el paso a «validado», los avisos no. */
export interface RevisionRol {
  valido: boolean;
  estado: EstadoRol;
  errores: string[];
  avisos: string[];
}

/** Un paso del rol en la auditoría. */
export interface EventoRol {
  accion: string;
  usuario: string;
  detalle: Record<string, unknown> | null;
  creadoEn: string;
}

export interface Novedades {
  horasSuplementarias: number;
  horasExtraordinarias: number;
  horasDescanso: number;
  horasNocturnas: number;
  comisiones: number;
  otrosDescuentos: number;
}

export interface EmpleadoDelPeriodo {
  id: number;
  nombres: string;
  cargo: string;
  sueldoBase: number;
  regimen: string;
  regimenAplicado: string;
  /** false = sus horas suplementarias, extraordinarias y de descanso no se pagan */
  recibeHorasExtras: boolean;
  novedades: Novedades;
}

export interface Periodo {
  anio: number;
  mes: number;
  existe: boolean;
  /** null = todavía no hay rol de ese mes */
  estado: EstadoRol | null;
  empleados: EmpleadoDelPeriodo[];
}

export interface EntradaSimulacion {
  sueldo: number;
  regimen?: string;
  categoriaLoep?: string;
  /** Modalidad de los décimos y fondos de reserva; sin ella, la del régimen */
  decimos?: Modalidad;
  horasSuplementarias?: number;
  horasExtraordinarias?: number;
  comisiones?: number;
}

/** Un puesto del orgánico funcional con su referencia salarial. */
export interface Puesto {
  id: number;
  nombre: string;
  /** Puesto del que depende; null en la cabeza del orgánico */
  superiorId: number | null;
  funcion: string;
  responsabilidad: string;
  /** Sector económico (rama de la comisión sectorial) */
  sector: string;
  escalaId: number | null;
  referencia: Grado | null;
  /** Cuántos empleados lo ocupan */
  empleados: number;
  /** Quién encabeza el puesto, si se le asignó un responsable */
  responsable: Persona | null;
  /** Los empleados activos que lo ocupan: de ellos sale el responsable */
  ocupantes: Persona[];
}

export interface Persona {
  id: number;
  nombres: string;
}

/** Un usuario de la cuenta. */
export interface UsuarioCuenta {
  id: number;
  email: string;
  rol: 'administrador' | 'aprobador' | 'lector';
  creadoEn: string;
}

export interface ListaUsuarios {
  roles: UsuarioCuenta['rol'][];
  usuarios: UsuarioCuenta[];
}

/** La empresa de la sesión y su configuración. */
export interface DatosCuenta {
  nombre: string;
  ruc: string;
  separarFunciones: boolean;
}
