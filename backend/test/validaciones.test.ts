import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aDecimal, cedulaValida, emailValido, fechaIsoValida, rucValido } from "../src/validaciones.ts";

describe("cedulaValida", () => {
  it("acepta una cédula correcta", () => assert.ok(cedulaValida("1801234566")));
  it("rechaza dígito verificador incorrecto", () => assert.ok(!cedulaValida("1801234567")));
  it("rechaza provincia inexistente", () => assert.ok(!cedulaValida("9901234566")));
  it("rechaza longitud incorrecta", () => assert.ok(!cedulaValida("18012345")));
  it("rechaza caracteres no numéricos", () => assert.ok(!cedulaValida("18012A4566")));
});

describe("rucValido", () => {
  it("acepta una persona natural: su cédula más el establecimiento", () => assert.ok(rucValido("1801234566001")));
  it("acepta una sociedad privada (tercer dígito 9, módulo 11)", () => {
    assert.ok(rucValido("1790010937001"));
    assert.ok(rucValido("1790000028001"));
  });
  it("acepta una entidad pública (tercer dígito 6, módulo 11)", () => assert.ok(rucValido("1760001550001")));
  it("rechaza un dígito verificador incorrecto", () => {
    assert.ok(!rucValido("1790010938001"));
    assert.ok(!rucValido("1760001560001"));
    assert.ok(!rucValido("1801234567001"));
  });
  it("rechaza establecimiento cero, longitud, provincia y tipo inexistentes", () => {
    assert.ok(!rucValido("1790010937000"));
    assert.ok(!rucValido("179001093700"));
    assert.ok(!rucValido("9990010937001"));
    assert.ok(!rucValido("1770010937001")); // tercer dígito 7: no existe
    assert.ok(!rucValido("17900109370AB"));
  });
});

describe("emailValido", () => {
  it("acepta un correo común", () => assert.ok(emailValido("nomina@empresa.com.ec")));
  it("rechaza lo que no tiene forma de correo", () => {
    for (const malo of ["", "sin-arroba", "a@b", "a b@c.com", "@c.com", `${"a".repeat(250)}@c.com`]) {
      assert.ok(!emailValido(malo), malo);
    }
  });
});

describe("aDecimal", () => {
  it("acepta coma o punto", () => assert.equal(aDecimal("12,5").toNumber(), 12.5));
  it("vacío o ausente es cero", () => {
    assert.equal(aDecimal("").toNumber(), 0);
    assert.equal(aDecimal(undefined).toNumber(), 0);
  });
  it("conserva los decimales exactos de un número JSON", () => {
    assert.equal(aDecimal(11.36).toString(), "11.36");
  });
  it("rechaza texto, negativos y NaN", () => {
    assert.throws(() => aDecimal("abc"));
    assert.throws(() => aDecimal("-1"));
    assert.throws(() => aDecimal("NaN"));
    assert.throws(() => aDecimal({}));
  });
});

describe("fechaIsoValida", () => {
  it("valida fechas reales", () => {
    assert.ok(fechaIsoValida("2024-02-29"));
    assert.ok(!fechaIsoValida("2025-02-29"));
    assert.ok(!fechaIsoValida("2025-13-01"));
    assert.ok(!fechaIsoValida("10/01/2025"));
    assert.ok(!fechaIsoValida(20250101));
  });
});
