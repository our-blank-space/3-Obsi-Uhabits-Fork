# Habit Loop Tracker para Obsidian

![GitHub release (latest by date)](https://img.shields.io/github/v/release/tu-usuario/obsidian-habit-loop)
![Downloads](https://img.shields.io/github/downloads/tu-usuario/obsidian-habit-loop/total)

**Habit Loop Tracker** es un plugin avanzado para [Obsidian](https://obsidian.md) diseñado para rastrear hábitos con un enfoque en la consistencia a largo plazo. Inspirado en la famosa app "Loop Habit Tracker", este plugin utiliza un algoritmo de puntuación suavizado (exponential smoothing) en lugar de simples rachas, permitiéndote fallar un día sin perder todo tu progreso visual.

Además, integra métricas de **contexto** (ánimo y energía) y se vincula profundamente con tu bóveda de Obsidian mediante la creación automática de notas de registro.


## ✨ Características Principales

*   **📊 Algoritmo Loop Score:** Calcula la "fuerza" de tu hábito basándose en la frecuencia y consistencia, no solo en rachas consecutivas.
*   **🧠 Métricas de Contexto:** Registra tu **Nivel de Energía** (1-5) y **Estado de Ánimo** (😫 😐 🙂 😄 🔥) junto con cada hábito para entender qué afecta tu rendimiento.
*   **📈 Analíticas Avanzadas:**
    *   Gráficos de tendencia (Chart.js).
    *   Distribución de ánimo (Gráfico de dona).
    *   Mapas de calor (Heatmaps).
    *   Tablas de consistencia semanal.
*   **🔢 Tipos Flexibles:** Soporta hábitos de tipo **Sí/No** (check) y **Numéricos** (ej. "Leer 20 páginas", "Correr 5km") con metas personalizables (mínimo, máximo o exacto).
*   **📝 Integración con Notas:** Crea automáticamente notas diarias por hábito usando plantillas personalizadas.
*   **📅 Vista Flexible:** Barra de días orientable (Recientes a la derecha o izquierda) y opciones de ordenamiento (Manual, Alfabético, Color).
*   **🛡️ Seguridad de Datos:** Sistema de Backups integrado (JSON y CSV) y herramientas de reparación de base de datos.

## 🚀 Instalación

### Desde BRAT (Beta)
1. Instala el plugin **BRAT** desde la tienda de la comunidad.
2. Añade el repositorio de GitHub: `tu-usuario/obsidian-habit-loop`.
3. Activa el plugin en la configuración.

### Manual
1. Descarga el `main.js`, `manifest.json` y `styles.css` de la última [Release](https://github.com/tu-usuario/obsidian-habit-loop/releases).
2. Crea una carpeta `obsidian-habit-loop` en tu carpeta `.obsidian/plugins/`.
3. Pega los archivos y recarga Obsidian.

## 📖 Guía de Uso

### 1. Crear un Hábito
Haz clic en el botón **"+ Hábito"** en la esquina superior derecha.
*   **Nombre:** Elige un nombre descriptivo.
*   **Tipo:**
    *   *Sí/No:* Para hábitos binarios (ej. Meditar).
    *   *Numérico:* Para cantidades (ej. Beber agua). Define la meta, la unidad y la condición (Al menos, Como máximo, Exactamente).

### 2. Registrar Progreso
Haz clic en cualquier celda de la cuadrícula:
*   **Valor:** Marca como hecho (✔), fallado (✖) o ingresa el número.
*   **Contexto:** Selecciona tu energía y ánimo del día.
*   **Notas:** Escribe una nota rápida. Si tienes configurada la creación de notas, se generará un archivo Markdown en tu bóveda.

### 3. Ver Analíticas
Haz clic en el **nombre del hábito** o en la barra de color a la izquierda para abrir el panel de analíticas detalladas. Podrás ver tu "Loop Score", rachas históricas y cómo se correlaciona tu ánimo con el cumplimiento.

## ⚙️ Configuración y Plantillas

El plugin permite vincular cada registro con una nota en tu bóveda.

### Variables de Plantilla
En la configuración del plugin, puedes definir el formato de la nota usando las siguientes variables:

| Variable | Descripción |
| :--- | :--- |
| `{{habit}}` | Nombre del hábito. |
| `{{date:YYYY-MM-DD}}` | Fecha del registro. |
| `{{value}}` | Valor registrado (ej. "✔", "20"). |
| `{{notes}}` | El texto que escribiste en el modal de registro. |
| `{{time:HH:mm}}` | Hora actual del registro. |

**Ejemplo de plantilla:**
```markdown
---
type: habit-log
date: {{date:YYYY-MM-DD}}
habit: {{habit}}
mood: {{mood}}
---
# Registro de {{habit}}
**Valor:** {{value}}

### Notas
{{notes}}
