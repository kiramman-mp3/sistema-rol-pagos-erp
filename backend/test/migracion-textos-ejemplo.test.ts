import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { abrirBase, consultar, ejecutar, migrar, uno } from "../src/db.ts";

/** La migración 025 quita de los datos de ejemplo las notas de la investigación, sin tocar lo que escribió la empresa. */
describe("migración 025: textos de los datos de ejemplo", () => {
  it("vacía las notas de investigación de los regímenes y cambia la fuente «por confirmar» de la escala", async () => {
    const db = await abrirBase(":memory:", { hasta: 24 });
    try {
      const notasAntes = await consultar(db, "SELECT codigo, notas FROM regimenes WHERE cuenta_id = 1");
      assert.ok(notasAntes.length >= 3);
      assert.ok(notasAntes.every((r) => String(r.notas) !== ""), "las notas de fábrica traen la investigación");
      const fuentesAntes = await consultar(db, "SELECT DISTINCT fuente FROM escala_salarial WHERE cuenta_id = 1");
      assert.ok(fuentesAntes.some((f) => String(f.fuente).includes("por confirmar")));

      // Lo que la empresa escribió por su cuenta no se toca.
      await ejecutar(db, "UPDATE escala_salarial SET fuente = 'Acuerdo de mi empresa' WHERE cuenta_id = 1 AND grado = 1 AND regimen = 'LOSEP'");
      await ejecutar(db, "UPDATE regimenes SET notas = 'Nota propia de la empresa' WHERE cuenta_id = 1 AND codigo = 'LOEP'");

      await migrar(db, 25);

      const notas = await consultar(db, "SELECT codigo, notas FROM regimenes WHERE cuenta_id = 1 ORDER BY codigo");
      for (const r of notas) {
        assert.equal(r.notas, r.codigo === "LOEP" ? "Nota propia de la empresa" : "", `notas de ${r.codigo}`);
      }
      const fuentes = (await consultar(db, "SELECT DISTINCT fuente FROM escala_salarial WHERE cuenta_id = 1")).map((f) => f.fuente);
      assert.ok(!fuentes.some((f) => String(f).includes("por confirmar")));
      assert.ok(fuentes.includes("Escala de ejemplo"));
      assert.equal(
        (await uno(db, "SELECT fuente FROM escala_salarial WHERE cuenta_id = 1 AND grado = 1 AND regimen = 'LOSEP'"))?.fuente,
        "Acuerdo de mi empresa",
      );
    } finally {
      await db.cerrar();
    }
  });
});
