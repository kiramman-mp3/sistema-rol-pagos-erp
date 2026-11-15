import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOM, celdaCsv, documentoCsv } from "../src/csv.ts";

describe("CSV para Excel", () => {
  it("empieza con la marca UTF-8 para que Excel lea bien las tildes", () => {
    assert.equal(documentoCsv(["a"], []).charCodeAt(0), 0xfeff);
    assert.equal(BOM.length, 1);
  });

  it("escribe encabezado y filas separados por saltos de línea", () => {
    const csv = documentoCsv(["nombre", "valor"], [["Ana", 10], ["Beto", 2.5]]);
    assert.equal(csv, `${BOM}nombre,valor\nAna,10\nBeto,2.5\n`);
  });

  it("entrecomilla lo que tiene comas, comillas o saltos de línea", () => {
    assert.equal(celdaCsv("Pérez, Ana"), '"Pérez, Ana"');
    assert.equal(celdaCsv('dijo "hola"'), '"dijo ""hola"""');
    assert.equal(celdaCsv("dos\nlíneas"), '"dos\nlíneas"');
    assert.equal(celdaCsv("simple"), "simple");
  });

  it("entrecomilla también el retorno de carro", () => {
    assert.equal(celdaCsv("a\rb"), '"a\rb"');
  });

  it("neutraliza el texto que Excel ejecutaría como fórmula", () => {
    assert.equal(celdaCsv("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
    assert.equal(celdaCsv("+1+1"), "'+1+1");
    assert.equal(celdaCsv("-2+3"), "'-2+3");
    assert.equal(celdaCsv("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(celdaCsv("\t=1"), "'\t=1");
  });

  it("deja intactos los números negativos y el texto normal", () => {
    assert.equal(celdaCsv(-5.5), "-5.5");
    assert.equal(celdaCsv("Ana-María"), "Ana-María");
    assert.equal(celdaCsv("1712345675"), "1712345675");
  });

  it("las celdas vacías o nulas quedan en blanco y el cero se conserva", () => {
    assert.equal(celdaCsv(null), "");
    assert.equal(celdaCsv(undefined), "");
    assert.equal(celdaCsv(0), "0");
  });
});
