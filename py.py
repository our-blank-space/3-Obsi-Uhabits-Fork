import os

# Carpetas y archivos a incluir
SRC_DIR = "src"

# Archivos en la raíz que SÍ deben incluirse
ARCHIVOS_RAIZ = [
    "main.ts",
    "manifest.json",
    "styles.css",
    "tsconfig.json",
    "",
    ""
]

# Archivo final
OUTPUT_FILE = "codigo_fuente.txt"

def extraer_archivo(ruta, salida):
    """Escribe el contenido de un archivo dentro del archivo final."""
    ruta_rel = os.path.relpath(ruta, ".")
    salida.write(f"\n\n===== {ruta_rel} =====\n\n")

    with open(ruta, "r", encoding="utf-8") as f:
        salida.write(f.read())


def extraer_codigo():
    with open(OUTPUT_FILE, "w", encoding="utf-8") as salida:

        # 1. Incluir archivos de la raíz
        for archivo in ARCHIVOS_RAIZ:
            if os.path.exists(archivo):
                extraer_archivo(archivo, salida)

        # 2. Recorrer carpeta src/
        for root, dirs, files in os.walk(SRC_DIR):
            for file in files:
                # Incluir todos los tipos de código
                if file.endswith((".ts", ".tsx", ".js", ".json", ".scss", ".css")):
                    ruta_archivo = os.path.join(root, file)
                    extraer_archivo(ruta_archivo, salida)

    print(f"✔ Código extraído correctamente → {OUTPUT_FILE}")


if __name__ == "__main__":
    extraer_codigo()
