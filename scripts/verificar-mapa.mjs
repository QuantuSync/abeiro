// Verificación headless: carga la app, captura errores de consola/página y
// confirma que el mapa MapLibre carga y la capa de etiquetas se renderiza.
// No forma parte del build; es una herramienta de verificación manual.
//
// Requiere Playwright disponible. Uso:
//   npm i -D playwright && npx playwright install chromium
//   (con el servidor dev levantado) node scripts/verificar-mapa.mjs
// Si Playwright está sólo en la caché de npx, exporta su ruta:
//   PLAYWRIGHT_PATH=<ruta>/node_modules/playwright/index.mjs node scripts/verificar-mapa.mjs
const especificador = process.env.PLAYWRIGHT_PATH || "playwright";
const { chromium } = await import(especificador);

const URL = process.env.URL || "http://localhost:3000";
const errores = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") errores.push("console.error: " + msg.text());
});
page.on("pageerror", (err) => errores.push("pageerror: " + err.message));

await page.goto(URL, { waitUntil: "networkidle" });

// Espera a que MapLibre exponga el mapa y dispare 'load'; comprueba la capa de etiquetas.
const resultado = await page.evaluate(async () => {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  // Espera hasta 15 s a que exista una instancia de mapa MapLibre con la capa de etiquetas.
  for (let i = 0; i < 150; i++) {
    const canvas = document.querySelector(".maplibregl-canvas");
    const maps = window.__abeiroMap;
    if (maps && maps.isStyleLoaded && maps.isStyleLoaded()) {
      const tieneEtiquetas = !!maps.getLayer("nucleos-etiqueta");
      const tienePuntos = !!maps.getLayer("nucleos-punto");
      const rasgos = maps.querySourceFeatures("nucleos");
      return {
        canvas: !!canvas,
        tieneEtiquetas,
        tienePuntos,
        numNucleos: rasgos.length,
      };
    }
    await esperar(100);
  }
  return { timeout: true, canvas: !!document.querySelector(".maplibregl-canvas") };
});

await browser.close();

console.log("Resultado:", JSON.stringify(resultado, null, 2));
const errGlyph = errores.filter((e) => /Unimplemented type|glyph/i.test(e));
console.log("Errores de glyphs/Unimplemented:", errGlyph.length ? errGlyph : "ninguno");
console.log("Otros errores de consola/página:", errores.length ? errores : "ninguno");

if (errGlyph.length) {
  console.error("FALLO: persiste el error de glyphs.");
  process.exit(1);
}
if (resultado.timeout || !resultado.tieneEtiquetas) {
  console.error("FALLO: el mapa o la capa de etiquetas no cargaron.");
  process.exit(2);
}
console.log("OK: mapa cargado y capa de etiquetas presente sin errores de glyphs.");
