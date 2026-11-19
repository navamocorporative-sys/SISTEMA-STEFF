# Sistema STEFF para eventos

Sistema web para administrar el negocio de eventos (fotografía, video y dron) de **STEFF**.

| Módulo | Qué hace |
|---|---|
| **Inicio (STEFF)** | Resumen de todo: próximos eventos, entregas pendientes y vencidas, eventos sin respaldo, saldos por cobrar y ganancias. |
| **Eventos** | Datos del cliente y del evento, venta y pagos, equipo asignado con **guía de trabajo en PDF** (envío por WhatsApp), fotos de **familiares**, respaldo y entrega de material. Incluye **Agenda** (disponibilidad de fechas y personal), **Equipo humano**, **Entrega de equipo** (inventario, salidas y devoluciones) y **Respaldos**. |
| **Contratos** | Contrato que se llena solo al elegir cliente y evento, vista previa, **PDF tamaño carta** y envío por WhatsApp. Apartados extra por contrato. Editor de **plantillas** (logo, apartados, notas, cláusulas, tiempos de entrega) y plantilla predeterminada. |
| **Entregas** | Estatus de cada evento y de cada entrega (pendiente, en edición, selección del cliente, listo, entregado), fechas límite y vencidas. |
| **Finanzas** | Inversión y ganancia por evento (equipo, gasolina, comida, proveedores, extras), inversión pendiente, ganancia por semana / mes, gastos generales, ganancia total acumulada y **PDF de resumen**. |
| **Proveedores** | Directorio, compras, pagos pendientes y PDF. |
| **Clientes** | Base de datos, estatus, antigüedad, cuánto han comprado, historial, notas de seguimiento y **mensajes de WhatsApp a varios clientes** (con imagen de promoción). |
| **Publicidad** | Registro de gastos y resultados por campaña, análisis por plataforma (costo por prospecto, retorno), ideas e innovación, planificación y **moodboard**. |
| **Configuración** | Datos del negocio, usuarios (administrador / colaborador), cambio de contraseña y guía de trabajo predeterminada. |

Tecnología: React + TypeScript + Vite + Tailwind CSS, base de datos y usuarios en **Supabase**.

---

## 1. Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo.
2. Ve a **SQL Editor → New query** y ejecuta, **en este orden**, el contenido de:
   1. `supabase/01_esquema.sql` (tablas, seguridad, archivos)
   2. `supabase/02_plantillas.sql` (contrato y guía de trabajo predeterminados)
   3. `supabase/03_crear_admin.sql` — **antes de ejecutarlo cambia la contraseña** que aparece en el archivo.
3. Ve a **Authentication → Sign In / Providers** y **desactiva “Allow new users to sign up”**. Los usuarios nuevos se crean desde el sistema (Configuración → Usuarios).

Para entrar al sistema: **Usuario:** `admin` · **Contraseña:** la que pusiste en el paso 2.3.

## 2. Conectar el sistema con Supabase

En Supabase ve a **Project Settings → API** y copia:

- **Project URL**
- **anon public key** (o *publishable key*)

## 3. Publicarlo en internet (Vercel, gratis)

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New → Project** → elige el repositorio `sistema-steff`.
2. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon / publishable key
3. Presiona **Deploy**. Vercel te da la dirección web del sistema.

Cada vez que se suba un cambio a GitHub, Vercel actualiza el sistema solo.

## 4. Trabajar en tu computadora (opcional)

```bash
npm install
cp .env.example .env   # y llena los dos valores
npm run dev
```

`npm run build` genera la versión de producción en `dist/`.

---

## Notas

- **Roles:** el *administrador* ve y modifica todo. El *colaborador* consulta y registra eventos, clientes, entregas, respaldos y equipo, pero no ve dinero (pagos, finanzas, proveedores).
- **WhatsApp:** los contratos y guías se generan en PDF, se guardan de forma privada y se envía por WhatsApp un enlace de descarga (válido 30 días). En celular también puedes usar “Compartir PDF” para mandar el archivo directo. Los mensajes a varios clientes se preparan uno por uno con un clic cada uno: WhatsApp no permite el envío masivo automático desde una página sin contratar su API de negocios.
- **Número de proyecto:** se genera con la fecha del evento en formato AAMMDD (ej. `261003`), igual que en las guías originales.
- **Archivos:** fotos de familiares, logos, moodboard y promociones se guardan en el bucket `media`; los PDF en el bucket privado `documentos`.
