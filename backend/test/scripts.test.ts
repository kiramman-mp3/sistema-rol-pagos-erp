import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { abrirBase, consultar } from "../src/db.ts";

const script = (nombre: string) => fileURLToPath(new URL(`../src/${nombre}.ts`, import.meta.url));

describe("scripts de consola: seed y usuario", () => {
  let carpeta: string;
  const correr = (nombre: string, ...argumentos: string[]) =>
    spawnSync(process.execPath, [script(nombre), ...argumentos], {
      env: { ...process.env, DATABASE_URL: undefined, DATABASE: carpeta }, encoding: "utf8",
    });

  before(() => {
    carpeta = mkdtempSync(join(tmpdir(), "rol-pagos-scripts-"));
  });
  after(() => rmSync(carpeta, { recursive: true, force: true }));

  it("el seed crea la cuenta de ejemplo con sus empleados y roles", () => {
    const r = correr("seed", "demo@empresa.com", "--clave", "una-clave-larga-1");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Cuenta creada para demo@empresa.com/);
    assert.match(r.stdout, /Listo: 12 empleados y 9 roles de pago/);
  });

  it("sin correo o con una cuenta que ya tiene datos, el seed se niega", () => {
    assert.equal(correr("seed").status, 1);
    const repetido = correr("seed", "demo@empresa.com");
    assert.equal(repetido.status, 1);
    assert.match(repetido.stderr, /ya tiene empleados o roles/);
    const sinClave = correr("seed", "nuevo@empresa.com");
    assert.equal(sinClave.status, 1);
    assert.match(sinClave.stderr, /--clave/);
  });

  it("--reiniciar borra solo los datos de esa cuenta", () => {
    assert.equal(correr("seed", "otra@empresa.com", "--clave", "otra-clave-larga-2").status, 0);
    const r = correr("seed", "demo@empresa.com", "--reiniciar");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Listo: 12 empleados/);
  });

  it("usuario --listar muestra cada cuenta con sus usuarios y empleados", () => {
    const r = correr("usuario", "--listar");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 {2}Plantilla del sistema \(plantilla de ley\) — 0 usuarios, 0 empleados/);
    assert.match(r.stdout, /Empresa Demo S\.A\. — 1 usuarios, 12 empleados/);
  });

  it("usuario agrega a una cuenta un usuario nuevo, y rechaza lo inválido", async () => {
    const ok = correr("usuario", "contador@empresa.com", "otra-clave-larga-3", "--cuenta", "2");
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(correr("usuario", "contador@empresa.com", "otra-clave-larga-3", "--cuenta", "2").status, 1); // repetido
    assert.equal(correr("usuario", "malo", "otra-clave-larga-3", "--cuenta", "2").status, 1); // correo
    assert.equal(correr("usuario", "x@empresa.com", "corta", "--cuenta", "2").status, 1); // contraseña
    assert.equal(correr("usuario", "x@empresa.com", "otra-clave-larga-3", "--cuenta", "1").status, 1); // plantilla
    assert.equal(correr("usuario", "x@empresa.com", "otra-clave-larga-3", "--cuenta", "99").status, 1); // no existe
    assert.equal(correr("usuario").status, 1);

    const db = await abrirBase(carpeta);
    try {
      const usuarios = await consultar(db, "SELECT email, cuenta_id FROM usuarios ORDER BY id");
      assert.deepEqual(usuarios.map((u) => [u.email, u.cuenta_id]), [
        ["demo@empresa.com", 2], ["otra@empresa.com", 3], ["contador@empresa.com", 2],
      ]);
    } finally {
      await db.cerrar();
    }
  });
});
