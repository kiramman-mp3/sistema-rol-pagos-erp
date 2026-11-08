/**
 * Roles de usuario y lo que puede hacer cada uno. Una sola tabla decide para toda la API:
 * `permisoQueExige` dice qué permiso pide una petición y `puede` si un rol lo tiene.
 * Lo que no se reconoce como lectura ni como paso del ciclo pide «editar»: ante la duda, se niega.
 */
export const ROLES_USUARIO = ["administrador", "aprobador", "lector"] as const;
export type RolUsuario = (typeof ROLES_USUARIO)[number];

export const PERMISOS = ["ver", "editar", "validar", "aprobar", "publicar", "pagar", "usuarios"] as const;
export type Permiso = (typeof PERMISOS)[number];

const POR_ROL: Record<RolUsuario, readonly Permiso[]> = {
  administrador: PERMISOS,
  aprobador: ["ver", "validar", "aprobar", "publicar"],
  lector: ["ver"],
};

export const esRolUsuario = (valor: unknown): valor is RolUsuario =>
  ROLES_USUARIO.includes(valor as RolUsuario);

export const permisosDe = (rol: RolUsuario): readonly Permiso[] => POR_ROL[rol];

export const puede = (rol: RolUsuario, permiso: Permiso): boolean => POR_ROL[rol].includes(permiso);

const PASO_DEL_CICLO = /^\/roles\/[^/]+\/(validar|aprobar|publicar|pagar)$/;

/** El permiso que pide una petición, según su método y su ruta (sin el prefijo `/api`). */
export function permisoQueExige(metodo: string, ruta: string): Permiso {
  const limpia = ruta.replace(/\/+$/, "").toLowerCase();
  if (limpia === "/usuarios" || limpia.startsWith("/usuarios/")) return "usuarios";
  if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS") return "ver";
  // El simulador de la página de inicio no cambia nada.
  if (metodo === "POST" && limpia === "/simulacion") return "ver";
  const paso = PASO_DEL_CICLO.exec(limpia);
  if (metodo === "POST" && paso) return paso[1] as Permiso;
  return "editar";
}
