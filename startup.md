# 🚀 Guía de Inicio Local - PagaCuotas

Esta guía detalla los pasos necesarios para configurar y ejecutar el sistema **PagaCuotas** en tu entorno local.

---

## 📋 Prerrequisitos

Antes de comenzar, asegúrate de tener instalado lo siguiente:

- **Node.js**: Versión 18.0 o superior.
- **npm**: (Viene incluido con Node.js).
- **Editor de Código**: Se recomienda [VS Code](https://code.visualstudio.com/).

---

## 🛠️ Configuración del Proyecto

Sigue estos pasos para poner en marcha la aplicación:

### 1. Clonar el Repositorio (u obtener los archivos)
Asegúrate de estar en el directorio raíz del proyecto:
```bash
cd PagaCuotas
```

### 2. Instalar Dependencias
Instala todos los paquetes necesarios mediante npm:
```bash
npm install
```

### 3. Configurar Variables de Entorno
Crea un archivo llamado `.env.local` en la raíz del proyecto (puedes basarte en `.env.example`):
```bash
cp .env.example .env.local
```

> [!IMPORTANT]
> Debes configurar tu `GEMINI_API_KEY` en el archivo `.env.local` para que las funcionalidades de IA operen correctamente.

---

## 🏃 Ejecución en Desarrollo

Para iniciar el servidor de desarrollo con **Vite**:

```bash
npm run dev
```

Una vez ejecutado, la aplicación estará disponible en:
- **Local**: `http://localhost:3000`
- **Red**: `http://<tu-ip>:3000` (si estás en la misma red local)

---

## 📁 Estructura del Proyecto

Para facilitar la navegación por el código, aquí tienes un resumen de la estructura:

- `src/pages/admin`: Contiene el portal de gestión para administradores (Dashboard, Clientes, Integraciones).
- `src/pages/client`: Contiene el portal para los clientes finales (Portal de pagos, Estado de cuenta).
- `src/components`: Componentes reutilizables de la interfaz.
- `src/lib`: Utilidades y configuraciones base.

---

## 📦 Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo en el puerto 3000. |
| `npm run build` | Genera el bundle de producción en la carpeta `dist`. |
| `npm run preview` | Previsualiza localmente la versión de producción generada. |
| `npm run lint` | Ejecuta el verificador de tipos de TypeScript. |
| `npm run clean` | Elimina la carpeta `dist`. |

---

## 🛠️ Notas sobre el Backend

El proyecto está preparado para la integración de un backend utilizando **Express** y **Prisma ORM**.
- Las dependencias ya están incluidas en `package.json`.
- Próximamente se añadirá el directorio `prisma/` para la gestión de la base de datos.

---

> [!TIP]
> Si encuentras problemas con las dependencias, intenta borrar la carpeta `node_modules` y el archivo `package-lock.json`, y luego ejecuta `npm install` nuevamente.

---

<div align="center">
  <sub>Construido con React 19 + Vite + Tailwind CSS v4</sub>
</div>
