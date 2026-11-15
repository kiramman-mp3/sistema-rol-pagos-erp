import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  crearSesion, DURACION_SESION_MS, hashClave, leerSesion, LimiteIntentos, secretoAleatorio, secretoDeEntorno,
  textosIguales, verificarClave,
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
  it("devuelve el usuario y su cuenta mientras no venza", () => {
    const token = crearSesion(7, 3, SECRETO, 1_000);
    assert.deepEqual(leerSesion(token, SECRETO, 2_000), { usuarioId: 7, cuentaId: 3, vence: 1_000 + DURACION_SESION_MS });
  });

  it("vence a las 8 horas", () => {
    const token = crearSesion(1, 1, SECRETO, 0);
    assert.notEqual(leerSesion(token, SECRETO, DURACION_SESION_MS - 1), null);
    assert.equal(leerSesion(token, SECRETO, DURACION_SESION_MS), null);
  });

  it("rechaza un token alterado, de otro secreto o mal formado", () => {
    const token = crearSesion(1, 1, SECRETO, 0);
    const [datos, firma] = token.split(".");
    // cambiar la cuenta sin volver a firmar: la firma ya no corresponde
    const otraCuenta = Buffer.from(JSON.stringify({ u: 1, c: 2, e: DURACION_SESION_MS })).toString("base64url");
    assert.equal(leerSesion(`${otraCuenta}.${firma}`, SECRETO, 1), null);
    assert.equal(leerSesion(`${datos}.${firma}x`, SECRETO, 1), null);
    assert.equal(leerSesion(token, "o".repeat(40), 1), null);
    for (const malo of [undefined, "", "sin-punto", "a.b.c", ".", "a."]) {
      assert.equal(leerSesion(malo, SECRETO, 1), null, String(malo));
    }
  });

  it("rechaza una sesión firmada con datos que no son ids, aunque la firma sea válida", () => {
    const firmada = (carga: object) => {
      const datos = Buffer.from(JSON.stringify(carga)).toString("base64url");
      return `${datos}.${createHmac("sha256", SECRETO).update(datos).digest("base64url")}`;
    };
    const vence = Date.now() + 1000;
    assert.notEqual(leerSesion(firmada({ u: 1, c: 1, e: vence }), SECRETO), null);
    for (const malo of [{ u: "1", c: 1, e: vence }, { u: 1, c: -1, e: vence }, { u: 1, e: vence }, { u: 1.5, c: 1, e: vence }]) {
      assert.equal(leerSesion(firmada(malo), SECRETO), null, JSON.stringify(malo));
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

describe("secreto de las sesiones desde el entorno", () => {
  it("sin la variable devuelve null: quien arranca decide qué hacer", () => {
    assert.equal(secretoDeEntorno({}), null);
    assert.equal(secretoDeEntorno({ SESION_SECRETO: "   " }), null);
  });

  it("con la variable devuelve el secreto", () => {
    assert.equal(secretoDeEntorno({ SESION_SECRETO: SECRETO }), SECRETO);
  });

  it("exige al menos 32 caracteres", () => {
    assert.throws(() => secretoDeEntorno({ SESION_SECRETO: "corto" }), /32 caracteres/);
  });

  it("el secreto temporal de trabajo local es largo y distinto cada vez", () => {
    assert.ok(secretoAleatorio().length >= 32);
    assert.notEqual(secretoAleatorio(), secretoAleatorio());
  });
});
