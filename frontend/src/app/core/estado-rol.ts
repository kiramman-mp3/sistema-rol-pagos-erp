import type { EstadoRol } from './modelos';

/** Los estados del rol en el orden en que se recorren. */
export const ESTADOS_ROL: { estado: EstadoRol; etiqueta: string }[] = [
  { estado: 'calculado', etiqueta: 'Calculado' },
  { estado: 'validado', etiqueta: 'Validado' },
  { estado: 'aprobado', etiqueta: 'Aprobado' },
  { estado: 'publicado', etiqueta: 'Publicado' },
  { estado: 'pagado', etiqueta: 'Pagado' },
];

export const etiquetaEstado = (estado: EstadoRol) => ESTADOS_ROL.find((e) => e.estado === estado)?.etiqueta ?? estado;

/** Publicado y pagado ya no se recalculan ni se eliminan. */
export const esInmutable = (estado: EstadoRol | null | undefined) => estado === 'publicado' || estado === 'pagado';

/** Color de la insignia de cada estado. */
export const claseEstado = (estado: EstadoRol) =>
  estado === 'pagado' || estado === 'publicado' ? 'insignia-neto' : estado === 'calculado' ? 'insignia-suave' : 'insignia-sol';
