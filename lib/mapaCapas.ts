// // lib/mapaCapas.ts (nuevo)
// import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
// // FUTURO... Lib depender de components no tiene sentido
// import type { NucleoProps } from "@/lib/tipos";
// import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";

// export function configurarCapas(map: MapLibreMap) {
//     // Perímetro quemado EMSR837 (capa de validación). Se carga del estático
//     // (recortado al piloto y simplificado) para no inflar el bundle.
//     map.addSource("perimetro", { type: "geojson", data: "/perimetro_emsr837.geojson" });
//     // Velo translúcido: relleno muy tenue + contorno suave, para que no compita
//     // con los núcleos.
//     map.addLayer({
//         id: "perimetro-fill",
//         type: "fill",
//         source: "perimetro",
//         paint: { "fill-color": "#7a1f12", "fill-opacity": 0.08 },
//     });
//     map.addLayer({
//         id: "perimetro-line",
//         type: "line",
//         source: "perimetro",
//         paint: { "line-color": "#7a1f12", "line-width": 0.8, "line-opacity": 0.4 },
//     });

//     // Rutas de evacuación (capa independiente). Casing blanco debajo + línea
//     // de color encima, para que destaquen con fuerza sobre el basemap. Color
//     // por % de pista forestal: verde = fiable (asfalto), naranja = depende de pista.
//     map.addSource("rutas", { type: "geojson", data: "/rutas_evacuacion.geojson" });
//     // Resaltado dorado (glow) de la ruta del núcleo seleccionado al pulsar
//     // "Ruta de escape en coche". Filtro vacío hasta que se active.
//     map.addLayer({
//         id: "rutas-resaltada",
//         type: "line",
//         source: "rutas",
//         layout: { "line-cap": "round", "line-join": "round" },
//         filter: ["==", ["get", "id"], "__ninguna__"],
//         paint: { "line-width": 13, "line-color": "#c8a44a", "line-opacity": 0.85, "line-blur": 1 },
//     });
//     map.addLayer({
//         id: "rutas-casing",
//         type: "line",
//         source: "rutas",
//         layout: { "line-cap": "round", "line-join": "round" },
//         paint: { "line-width": 7, "line-color": "#ffffff", "line-opacity": 0.9 },
//     });
//     map.addLayer({
//         id: "rutas-evacuacion",
//         type: "line",
//         source: "rutas",
//         layout: { "line-cap": "round", "line-join": "round" },
//         paint: {
//         "line-width": 4,
//         "line-opacity": 1,
//         "line-color": [
//             "step", ["get", "pct_track"],
//             "#127c43", 15, "#d68a00", 30, "#b83a16",
//         ],
//         },
//     });

//     //ANTES: map.addSource("nucleos", { type: "geojson", data: nucleos });
//     // AHORA: data vacío. aun no tenemos nucleos con datos cargados en usEffect([]) 
//     map.addSource("nucleos", { type: "geojson", data:{
//         type:"FeatureCollection", 
//         features:[] //vacio porque hacemos fetching de datos de nucleos
//     } }); 


//     // Destinos seguros (cabeceras comarcales): marcador de estrella/diamante.
//     map.addLayer({
//         id: "destinos-seguros",
//         type: "circle",
//         source: "nucleos",
//         filter: ["==", ["get", "es_destino"], true],
//         paint: {
//         "circle-radius": 7,
//         "circle-color": "#0b6e99",
//         "circle-stroke-width": 2,
//         "circle-stroke-color": "#ffffff",
//         },
//     });

//     // Halo blanco para separar el marcador del basemap (legibilidad).
//     map.addLayer({
//         id: "nucleos-halo",
//         type: "circle",
//         source: "nucleos",
//         paint: {
//         "circle-radius": [
//             "interpolate", ["linear"], ["get", "iv"],
//             0, 7.5, 100, 14,
//         ],
//         "circle-color": "#ffffff",
//         "circle-opacity": 0.92,
//         },
//     });

//     // Círculo coloreado por Índice de Vulnerabilidad, con borde oscuro definido
//     // para destacar con fuerza sobre el basemap.
//     map.addLayer({
//         id: "nucleos-punto",
//         type: "circle",
//         source: "nucleos",
//         paint: {
//         "circle-radius": [
//             "interpolate", ["linear"], ["get", "iv"],
//             0, 5, 100, 11,
//         ],
//         "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
//         "circle-stroke-width": 1.8,
//         "circle-stroke-color": "#1c1c1c",
//         },
//     });

//     // Anillo distintivo para núcleos que YA usan dato de edad real (Fase 1).
//     map.addLayer({
//         id: "nucleos-dato-real",
//         type: "circle",
//         source: "nucleos",
//         filter: ["==", ["get", "dato_edad_real"], true],
//         paint: {
//         "circle-radius": [
//             "interpolate", ["linear"], ["get", "iv"],
//             0, 9.5, 100, 16.5,
//         ],
//         "circle-color": "rgba(0,0,0,0)",
//         "circle-stroke-width": 2,
//         "circle-stroke-color": "#1a7d45",
//         },
//     });

//     // Marcador de afectación física (EMSR837): punto central oscuro para los
//     // núcleos dentro del perímetro quemado.
//     map.addLayer({
//         id: "nucleos-afectado",
//         type: "circle",
//         source: "nucleos",
//         filter: ["==", ["get", "afect_fisica"], true],
//         paint: {
//         "circle-radius": 2.4,
//         "circle-color": "#3a0d06",
//         "circle-stroke-width": 0.8,
//         "circle-stroke-color": "#ffffff",
//         },
//     });

//     // Etiqueta con el nombre del núcleo. Grande, en negrita y con halo blanco
//     // fuerte para leerse sobre cualquier fondo (legibilidad de usuarios mayores).
//     // Anclaje variable + padding de colisión para que no se pisen al norte.
//     map.addLayer({
//         id: "nucleos-etiqueta",
//         type: "symbol",
//         source: "nucleos",
//         layout: {
//         "text-field": ["get", "nombre"],
//         "text-font": ["Noto Sans Bold"],
//         "text-size": [
//             "interpolate", ["linear"], ["zoom"],
//             8, 12, 11, 14.5, 14, 16,
//         ],
//         "text-radial-offset": 1,
//         "text-variable-anchor": ["top", "bottom", "left", "right"],
//         "text-justify": "auto",
//         "text-padding": 8,
//         "text-allow-overlap": false,
//         "symbol-sort-key": ["-", 100, ["coalesce", ["get", "iv"], 0]],
//         },
//         paint: {
//         "text-color": "#161b18",
//         "text-halo-color": "#ffffff",
//         "text-halo-width": 2.4,
//         "text-halo-blur": 0.4,
//         },
//     });
  
// }

// export function configurarInteraccionNucleos(
//     map: MapLibreMap,
//     capaId: string,
//     setSeleccionado: (props: NucleoProps | null) => void
// ) {

//     // si haces click en el nucleo te lo selecciona (muestra panelInfo en Mapa Vulenarbilidad)
//     map.on("click", capaId, (e) => {
//         const f = e.features?.[0];
//         if (!f) return;
//         setSeleccionado(f.properties as unknown as NucleoProps);
//     });
    
//     // Clic en zona vacía cierra el panel.
//     map.on("click", (e) => {
//         const hits = map.queryRenderedFeatures(e.point, { layers: [capaId] });
//         // si haces click fuera, MapaVulnerabilidad deja de mostrar PanelInfo
//         if (hits.length === 0) setSeleccionado(null); 
//     });

//     // cambia el cursor al pasar por encima
//     map.on("mouseenter", capaId, () => {
//         map.getCanvas().style.cursor = "pointer";
//     });
//     map.on("mouseleave", capaId, () => {
//         map.getCanvas().style.cursor = "";
//     });


// }