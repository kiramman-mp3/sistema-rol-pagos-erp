-- Roles de usuario y separación de funciones.
--   administrador  todo: datos, generar roles, aprobar, publicar, pagar y gestionar usuarios.
--   aprobador      consulta, valida, aprueba y publica roles; no cambia datos ni marca pagos.
--   lector         solo consulta.
-- Los usuarios que ya existían quedan como administradores (era lo único que podían hacer).
-- `separar_funciones`: si la cuenta lo activa, quien generó un rol no puede aprobarlo ni publicarlo.
-- `generado_por` guarda quién generó cada rol, para aplicar esa regla.

ALTER TABLE usuarios
    ADD COLUMN rol TEXT NOT NULL DEFAULT 'administrador'
        CHECK (rol IN ('administrador', 'aprobador', 'lector'));

ALTER TABLE cuentas ADD COLUMN separar_funciones BOOLEAN NOT NULL DEFAULT FALSE;

-- Sin clave foránea, como en audit_logs: el dato no cambia si el usuario se elimina.
ALTER TABLE roles_cabecera ADD COLUMN generado_por INTEGER;
