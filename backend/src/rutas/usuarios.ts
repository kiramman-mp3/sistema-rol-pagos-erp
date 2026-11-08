import { Router } from "express";

import { registrarAuditoria } from "../auditoria.ts";
import { hashClave } from "../auth.ts";
import { CLAVE_MAXIMA, CLAVE_MINIMA } from "../cuentas.ts";
import { consultar, ejecutar, esDuplicado, filaACamel, insertar, transaccion, uno } from "../db.ts";
import type { Base } from "../db.ts";
import { esRolUsuario, ROLES_USUARIO } from "../permisos.ts";
import { emailValido, ErrorApi, leerId } from "../validaciones.ts";
import { cuentaDe, usuarioDe } from "./auth.ts";

const COLUMNAS = "id, email, rol, creado_en";

const errorUltimoAdministrador = () =>
  new ErrorApi(409, ["La cuenta debe conservar al menos un administrador."]);

function leerClave(valor: unknown, errores: string[]): string {
  const clave = typeof valor === "string" ? valor : "";
  if (clave.length < CLAVE_MINIMA) errores.push(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
  else if (clave.length > CLAVE_MAXIMA) errores.push(`La contraseña no puede pasar de ${CLAVE_MAXIMA} caracteres.`);
  return clave;
}

/**
 * Los usuarios de la cuenta y sus roles. Solo el administrador entra aquí (ver `permisos.ts`).
 * Sin correo electrónico no hay invitaciones: el administrador define la contraseña inicial y la
 * persona puede recibir una nueva con `PATCH` si la pierde.
 */
export function rutasUsuarios(db: Base): Router {
  const router = Router();

  /** Cuántos administradores tiene la cuenta aparte de `excepto`, con la cuenta bloqueada para que dos cambios simultáneos no la dejen sin ninguno. */
  const hayOtroAdministrador = async (tx: Base, cuentaId: number, excepto: number) => {
    await tx.consultar("SELECT id FROM cuentas WHERE id = ? FOR UPDATE", [cuentaId]);
    const fila = await uno(
      tx, "SELECT COUNT(*) AS n FROM usuarios WHERE cuenta_id = ? AND rol = 'administrador' AND id <> ?", cuentaId, excepto,
    );
    return Number(fila?.n) > 0;
  };

  const cargar = async (cuentaId: number, idTexto: string) => {
    const usuario = await uno(db, `SELECT ${COLUMNAS} FROM usuarios WHERE cuenta_id = ? AND id = ?`, cuentaId, leerId(idTexto));
    if (!usuario) throw new ErrorApi(404, ["El usuario no existe."]);
    return usuario;
  };

  router.get("/", async (_req, res) => {
    const usuarios = await consultar(db, `SELECT ${COLUMNAS} FROM usuarios WHERE cuenta_id = ? ORDER BY id`, cuentaDe(res));
    res.json({ roles: ROLES_USUARIO, usuarios: usuarios.map(filaACamel) });
  });

  router.post("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const cuerpo = req.body ?? {};
    const errores: string[] = [];
    const email = typeof cuerpo.email === "string" ? cuerpo.email.trim().toLowerCase() : "";
    if (!emailValido(email)) errores.push("El correo no es válido.");
    if (!esRolUsuario(cuerpo.rol)) errores.push(`El rol debe ser uno de: ${ROLES_USUARIO.join(", ")}.`);
    const clave = leerClave(cuerpo.clave, errores);
    if (errores.length) throw new ErrorApi(400, errores);

    const claveHash = await hashClave(clave);
    try {
      const id = await transaccion(db, async (tx) => {
        const nuevoId = await insertar(
          tx, "INSERT INTO usuarios (cuenta_id, email, clave_hash, rol) VALUES (?, ?, ?, ?)",
          cuentaId, email, claveHash, cuerpo.rol,
        );
        await registrarAuditoria(tx, {
          cuentaId, usuarioId: usuarioDe(res), accion: "usuario.creado", entidad: "usuario", entidadId: nuevoId,
          detalle: { email, rol: cuerpo.rol },
        });
        return nuevoId;
      });
      res.status(201).json(filaACamel((await uno(db, `SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, id))!));
    } catch (error) {
      if (esDuplicado(error)) throw new ErrorApi(409, ["Ese correo ya está en uso."]);
      throw error;
    }
  });

  /** Cambia el rol o la contraseña de un usuario (o las dos). */
  router.patch("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await cargar(cuentaId, req.params.id);
    const cuerpo = req.body ?? {};
    const errores: string[] = [];
    const cambiaRol = cuerpo.rol !== undefined;
    const cambiaClave = cuerpo.clave !== undefined;
    if (!cambiaRol && !cambiaClave) errores.push("Indica el rol o la contraseña nueva.");
    if (cambiaRol && !esRolUsuario(cuerpo.rol)) errores.push(`El rol debe ser uno de: ${ROLES_USUARIO.join(", ")}.`);
    const clave = cambiaClave ? leerClave(cuerpo.clave, errores) : "";
    if (errores.length) throw new ErrorApi(400, errores);

    const claveHash = cambiaClave ? await hashClave(clave) : null;
    await transaccion(db, async (tx) => {
      if (cambiaRol && cuerpo.rol !== actual.rol) {
        if (actual.rol === "administrador" && !(await hayOtroAdministrador(tx, cuentaId, Number(actual.id)))) {
          throw errorUltimoAdministrador();
        }
        await ejecutar(tx, "UPDATE usuarios SET rol = ? WHERE id = ?", cuerpo.rol, Number(actual.id));
        await registrarAuditoria(tx, {
          cuentaId, usuarioId: usuarioDe(res), accion: "usuario.rol_cambiado", entidad: "usuario",
          entidadId: Number(actual.id), detalle: { email: actual.email, de: actual.rol, a: cuerpo.rol },
        });
      }
      if (claveHash) {
        await ejecutar(tx, "UPDATE usuarios SET clave_hash = ? WHERE id = ?", claveHash, Number(actual.id));
        // La contraseña nunca va a la auditoría, ni en claro ni como hash.
        await registrarAuditoria(tx, {
          cuentaId, usuarioId: usuarioDe(res), accion: "usuario.clave_cambiada", entidad: "usuario",
          entidadId: Number(actual.id), detalle: { email: actual.email },
        });
      }
    });
    res.json(filaACamel((await uno(db, `SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, Number(actual.id)))!));
  });

  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await cargar(cuentaId, req.params.id);
    if (Number(actual.id) === usuarioDe(res)) throw new ErrorApi(409, ["No puedes eliminar tu propio usuario."]);
    await transaccion(db, async (tx) => {
      if (actual.rol === "administrador" && !(await hayOtroAdministrador(tx, cuentaId, Number(actual.id)))) {
        throw errorUltimoAdministrador();
      }
      await ejecutar(tx, "DELETE FROM usuarios WHERE id = ?", Number(actual.id));
      await registrarAuditoria(tx, {
        cuentaId, usuarioId: usuarioDe(res), accion: "usuario.eliminado", entidad: "usuario",
        entidadId: Number(actual.id), detalle: { email: actual.email, rol: actual.rol },
      });
    });
    res.status(204).end();
  });

  return router;
}
