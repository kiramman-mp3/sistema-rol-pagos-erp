/** Escritura de CSV que Excel abre bien. */

// Excel abre el CSV en UTF-8 solo si empieza con esta marca.
export const BOM = String.fromCharCode(0xfeff);

// Excel ejecuta como fórmula toda celda de texto que empiece con estos caracteres.
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

export const celdaCsv = (valor: unknown) => {
  const crudo = String(valor ?? "");
  // Solo se neutraliza el texto: un número negativo real debe seguir siendo número.
  const texto = typeof valor === "string" && INICIO_DE_FORMULA.test(crudo) ? `'${crudo}` : crudo;
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
};

/** Encabezado y filas listos para enviar, con la marca de UTF-8 al inicio. */
export function documentoCsv(encabezado: string[], filas: unknown[][]): string {
  const lineas = [encabezado, ...filas].map((fila) => fila.map(celdaCsv).join(","));
  return `${BOM}${lineas.join("\n")}\n`;
}
