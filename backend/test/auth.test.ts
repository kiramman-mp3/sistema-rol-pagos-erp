import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authDeEntorno, crearSesion, DURACION_SESION_MS, hashClave, leerSesion, LimiteIntentos, textosIguales,
  verificarClave,
} from "../src/auth.ts";

const SECRETO = "s".repeat(40);

describe("contraseñas", () => {
  it("la contraseña correcta coincide y las demás no", async () => {
    const hash = await hashClave("clave-segura");
    assert.match(hash, /^scrypt\.16384\.8\.1\.[\w-]+\.[\w-]+$/);
    assert.equal(await verificarClave("clave-segura", hash), true);
    assert.equal(await verificarClave("clave-segurA", hash), false);
    assert.equal(await verificarClave("", hash), false);
  });

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", async () => {
    assert.notEqual(await hashClave("x"), await hashClave("x"));
  });

  it("un hash mal formado nunca coincide", async () => {
    for (const malo of ["", "texto", "bcrypt.a.b", "scrypt.0.8.1.AA.AA", "scrypt.16384.8.1..", "scrypt$16384$8$1$AA$AA"]) {
      assert.equal(await verificarClave("x", malo), false, malo);
    }
  });

  it("compara textos en tiempo constante, de cualquier largo", () => {
    assert.equal(textosIguales("admin", "admin"), true);
    assert.equal(textosIguales("admin", "Admin"), false);
    assert.equal(textosIguales("a", "aaaaaaaaaaaa"), false);
  });
});

describe("sesión firmada", () => {
  it("devuelve el usuario mientras no venza", () => {
    const token = crearSesion("ana", SECRETO, 1_000);
    assert.deepEqual(leerSesion(token, SECRETO, 2_000), { usuario: "ana", vence: 1_000 + DURACION_SESION_MS });
  });

  it("vence a las 8 horas", () => {
    const token = crearSesion("ana", SECRETO, 0);
    assert.notEqual(leerSesion(token, SECRETO, DURACION_SESION_MS - 1), null);
    assert.equal(leerSesion(token, SECRETO, DURACION_SESION_MS), null);
  });

  it("rechaza un token alterado, de otro secreto o mal formado", () => {
    const token = crearSesion("ana", SECRETO, 0);
    const [datos, firma] = token.split(".");
    const otroUsuario = Buffer.from(JSON.stringify({ u: "root", e: DURACION_SESION_MS })).toString("base64url");
    assert.equal(leerSesion(`${otroUsuario}.${firma}`, SECRETO, 1), null);
    assert.equal(leerSesion(`${datos}.${firma}x`, SECRETO, 1), null);
    assert.equal(leerSesion(token, "o".repeat(40), 1), null);
    for (const malo of [undefined, "", "sin-punto", "a.b.c", ".", "a."]) {
      assert.equal(leerSesion(malo, SECRETO, 1), null, String(malo));
    }
  });
});

describe("límite de intentos", () => {
  it("bloquea tras cinco fallos y se libera al pasar la ventana", () => {
    const limite = new LimiteIntentos();
    for (let i = 0; i < 4; i++) limite.fallo("1.1.1.1", 0);
    assert.equal(limite.segundosDeEspera("1.1.1.1", 0), 0);
    limite.fallo("1.1.1.1", 0);
    assert.equal(limite.segundosDeEspera("1.1.1.1", 0), 900);
    assert.equal(limite.segundosDeEspera("1.1.1.1", 600_000), 300);
    assert.equal(limite.segundosDeEspera("1.1.1.1", LimiteIntentos.VENTANA_MS), 0);
  });

  it("cuenta por IP y un acierto limpia la cuenta", () => {
    const limite = new LimiteIntentos();
    for (let i = 0; i < 5; i++) limite.fallo("1.1.1.1", 0);
    assert.equal(limite.segundosDeEspera("2.2.2.2", 0), 0);
    limite.exito("1.1.1.1");
    assert.equal(limite.segundosDeEspera("1.1.1.1", 0), 0);
  });
});

describe("configuración desde el entorno", () => {
  const completo = { ADMIN_USUARIO: "admin", ADMIN_CLAVE_HASH: "scrypt.x", SESION_SECRETO: SECRETO };

  it("sin variables, la autenticación queda apagada", () => {
    assert.equal(authDeEntorno({}), null);
  });

  it("con las tres, devuelve la configuración", () => {
    assert.deepEqual(authDeEntorno(completo), { usuario: "admin", claveHash: "scrypt.x", secreto: SECRETO });
  });

  it("con alguna sola es un error que dice cuál falta", () => {
    assert.throws(() => authDeEntorno({ ADMIN_USUARIO: "admin" }), /ADMIN_CLAVE_HASH y SESION_SECRETO/);
    assert.throws(() => authDeEntorno({ ...completo, SESION_SECRETO: "" }), /SESION_SECRETO/);
  });

  it("exige un secreto de al menos 32 caracteres", () => {
    assert.throws(() => authDeEntorno({ ...completo, SESION_SECRETO: "corto" }), /32 caracteres/);
  });
});
