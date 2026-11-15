import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { abrirBase, aPlaceholders, consultar, descripcionDeDestino, esBaseRemota, migrar, opcionesSsl, uno, versionEsquema } from "../src/db.ts";

const ULTIMA = readdirSync(new URL("../src/migraciones/", import.meta.url))
  .filter((f) => f.endsWith(".sql"))
  .length;

describe("migraciones del esquema", () => {
  it("una base nueva queda en la última versión", async () => {
    const db = await abrirBase(":memory:");
    assert.equal(await versionEsquema(db), ULTIMA);
    await db.cerrar();
  });

  it("migrar otra vez no repite migraciones ni duplica datos", async () => {
    const db = await abrirBase(":memory:");
    try {
      const contar = async () => ({
        tablas: Number((await uno(db, "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = 'public'"))?.n),
        regimenes: Number((await uno(db, "SELECT COUNT(*) AS n FROM regimenes"))?.n),
        escala: Number((await uno(db, "SELECT COUNT(*) AS n FROM escala_salarial"))?.n),
        puestos: Number((await uno(db, "SELECT COUNT(*) AS n FROM puestos"))?.n),
      });
      const antes = await contar();
      await migrar(db);
      assert.equal(await versionEsquema(db), ULTIMA);
      assert.deepEqual(await contar(), antes);
    } finally {
      await db.cerrar();
    }
  });

  it("los puestos de ejemplo traen su id escrito y el siguiente sigue desde ahí", async () => {
    const db = await abrirBase(":memory:");
    try {
      const nuevo = await uno(
        db,
        `INSERT INTO puestos (cuenta_id, nombre, funcion, responsabilidad, sector, escala_id)
         VALUES (1, 'Nuevo', 'f', 'r', 's', NULL) RETURNING id`,
      );
      assert.equal(nuevo?.id, 6);
      assert.equal((await consultar(db, "SELECT id FROM puestos ORDER BY id")).length, 6);
    } finally {
      await db.cerrar();
    }
  });

  it("los números salen como números y las transacciones se deshacen si algo falla", async () => {
    const db = await abrirBase(":memory:");
    try {
      const fila = await uno(db, "SELECT COUNT(*) AS n, SUM(rmu) AS suma FROM escala_salarial");
      assert.equal(typeof fila?.n, "number");
      assert.equal(typeof fila?.suma, "number");

      await assert.rejects(
        db.transaccion(async (tx) => {
          await tx.consultar("DELETE FROM escala_salarial", []);
          throw new Error("falla a medias");
        }),
        /falla a medias/,
      );
      assert.equal((await uno(db, "SELECT COUNT(*) AS n FROM escala_salarial"))?.n, fila?.n);
    } finally {
      await db.cerrar();
    }
  });
});

describe("placeholders", () => {
  it("cambia ? por $1, $2… sin tocar los que están dentro de un texto", () => {
    assert.equal(
      aPlaceholders("SELECT * FROM t WHERE a = ? AND b = '¿?' AND c = ?"),
      "SELECT * FROM t WHERE a = $1 AND b = '¿?' AND c = $2",
    );
  });
});

describe("TLS hacia el servidor", () => {
  const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

  it("verifica el certificado por defecto", () => {
    assert.deepEqual(opcionesSsl({}), { rejectUnauthorized: true });
  });

  it("usa la CA que viene como texto PEM", () => {
    assert.deepEqual(opcionesSsl({ DATABASE_SSL_CA: PEM }), { rejectUnauthorized: true, ca: PEM });
  });

  it("lee la CA desde un archivo", () => {
    const ruta = fileURLToPath(new URL("../src/migraciones/001_base.sql", import.meta.url));
    const { ca } = opcionesSsl({ DATABASE_SSL_CA: ruta }) as { ca: string };
    assert.match(ca, /CREATE TABLE/);
  });

  it("solo deja de verificar con DATABASE_SSL_INSECURE=1", () => {
    assert.deepEqual(opcionesSsl({ DATABASE_SSL_INSECURE: "1" }), { rejectUnauthorized: false });
    assert.deepEqual(opcionesSsl({ DATABASE_SSL_INSECURE: "true" }), { rejectUnauthorized: true });
  });
});

describe("destino de la base", () => {
  it("distingue un servidor Postgres de PGlite", () => {
    assert.equal(esBaseRemota("postgresql://u:p@host:6543/postgres"), true);
    assert.equal(esBaseRemota("postgres://u:p@host/db"), true);
    assert.equal(esBaseRemota(":memory:"), false);
    assert.equal(esBaseRemota("C:/datos/pglite"), false);
  });

  it("describe la URL sin usuario ni contraseña", () => {
    const texto = descripcionDeDestino("postgresql://postgres.abc:secreto@aws-0.pooler.supabase.com:6543/postgres");
    assert.equal(texto, "aws-0.pooler.supabase.com:6543/postgres");
    assert.ok(!texto.includes("secreto"));
  });

  it("el seed se niega a reiniciar un servidor sin confirmación y no se conecta", () => {
    const r = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../src/seed.ts", import.meta.url)), "demo@empresa.com", "--reiniciar"],
      { env: { ...process.env, DATABASE_URL: "postgresql://u:secreto@127.0.0.1:1/x" }, encoding: "utf8" },
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--confirmo-produccion/);
    assert.match(r.stderr, /127\.0\.0\.1:1\/x/);
    assert.ok(!r.stderr.includes("secreto"));
  });
});

describe("arranque con el esquema al día", () => {
  it("migrar hace solo dos consultas cuando no hay nada pendiente", async () => {
    const db = await abrirBase(":memory:");
    try {
      let consultas = 0;
      const contada: typeof db = {
        ...db,
        consultar: (sql, params) => (consultas++, db.consultar(sql, params)),
        ejecutarScript: (sql) => (consultas++, db.ejecutarScript(sql)),
        transaccion: (trabajo) => (consultas++, db.transaccion(trabajo)),
      };
      await migrar(contada);
      assert.equal(consultas, 2); // crear la tabla de control si falta y leer la versión
      assert.equal(await versionEsquema(db), ULTIMA);
    } finally {
      await db.cerrar();
    }
  });

  it("aplica solo las migraciones pendientes", async () => {
    const db = await abrirBase(":memory:", { hasta: 3 });
    try {
      assert.equal(await versionEsquema(db), 3);
      await migrar(db, 5);
      assert.equal(await versionEsquema(db), 5);
      await migrar(db);
      assert.equal(await versionEsquema(db), ULTIMA);
    } finally {
      await db.cerrar();
    }
  });
});
