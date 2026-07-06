"use client"; //BUSCADOR DEL HEADER. APARECEN LAS COMARCAS DISPONIBLES.

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Comarca } from "@/lib/tipos";

// Quita acentos para que "verin" o "carballiño" (sin ñ) encuentren resultado.
function normalizar(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

export default function BuscadorComarcas({
        comarcas,
        valor,
        onChange, //setComarcaActual
    }: {
        comarcas: Comarca[];
        valor: Comarca;
        onChange: (c: Comarca) => void;
    }) 
    {
    const [texto, setTexto] = useState("");
    const [abierto, setAbierto] = useState(false);
    const [activo, setActivo] = useState(0); // índice resaltado con teclado
    //useRef es una caja que persiste entre renders. no triggerea un render
    // es para guardar el elto del DOM <input>
    const inputRef = useRef<HTMLInputElement>(null); 
    const listboxId = useId();

    //variable que se actualiza en cada render. si el texto del user cambia, filtra comarcas.
    const resultados = texto.trim() //(elimina espacios del string)
       //si escribio algo, filtra comarcas
        ? comarcas.filter((c) => {
            const q = normalizar(texto);
            return normalizar(c.nombre).includes(q); //|| normalizar(c.capital ?? "").includes(q);
        })
        // si no escribio, muestra comarcas enteras
        : comarcas;

    //se llama al hacer ENTER
    function seleccionar(nuevaComarca: Comarca) {
        onChange(nuevaComarca); //setComarcaActual(nuevaComarca) en ExploradorMapa
        setTexto("");
        setAbierto(false);
        inputRef.current?.blur(); // quitar focus del buscador
    }

    function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
        if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setAbierto(true);
            return;
        }
        if (!abierto) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((i) => Math.min(i + 1, resultados.length - 1));
        } 
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => Math.max(i - 1, 0));
        } 
        else if (e.key === "Enter") {
            e.preventDefault();

            if (resultados[activo]) 
                seleccionar(resultados[activo]);
        } 
        else if (e.key === "Escape") {
            setAbierto(false);
        }
    }

    return (
        <div className="buscador-comarcas" role="combobox" aria-expanded={abierto} aria-haspopup="listbox">
        <input
            ref={inputRef}
            type="text"
            className="buscador-input"
            placeholder={`Ir a comarca: ${valor.nombre}`}
            value={texto}
            onChange={(e) => {
                setTexto(e.target.value);
                setAbierto(true);
                setActivo(0);
            }}
            onFocus={() => setAbierto(true)}
            onBlur={() => 
                     // Retraso corto: onMouseDown y onBlur se dispararian a la vez, asi que metemos un delay
                    // deja que el click en la lista (onMouseDown) se dispare antes de que el blur la cierre.
                    setTimeout(() =>
                            setAbierto(false), 
                            120 // milisegundos
                        )
                    }
            onKeyDown={alTeclear}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-label="Buscar comarca"
        />

        {/* si está abierto, que te pinte la lista de resultados */}
        {abierto && (
            <ul className="buscador-lista" role="listbox" id={listboxId}>
            {resultados.length === 0 ? (
                <li className="buscador-vacio" aria-disabled="true">
                Sin resultados
                </li>
            ) : (
                resultados.map((c, i) => (
                <li
                    key={c.id}
                    role="option"
                    aria-selected={c.id === valor.id}
                    className={`buscador-opcion${i === activo ? " resaltada" : ""}${
                    c.id === valor.id ? " seleccionada" : ""
                    }`}
                    // onMouseDown (no onClick): se ejecuta antes del onBlur del input.
                    onMouseDown={(e) => {
                    e.preventDefault();
                    seleccionar(c);
                    }}
                    onMouseEnter={() => setActivo(i)}
                >
                    <span className="buscador-nombre">{c.nombre}</span>
                    {/* {c.capital && <span className="buscador-capital">{c.capital}</span>} */}
                </li>
                ))
            )}
            </ul>
        )}
        </div>
    );
}
