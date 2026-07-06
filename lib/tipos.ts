export type Comarca = {
    id: string;
    nombre: string;
    centro: [number, number]; // [lon, lat], para el flyTo inicial
};