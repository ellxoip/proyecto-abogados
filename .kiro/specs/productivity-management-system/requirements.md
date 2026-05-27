# Requirements Document: Sistema de Productividad y Control de Gestión con IA

## Introduction

El Sistema de Productividad y Control de Gestión con IA es una extensión integral del Legal Operating System AT INFORMA que permite medir, analizar y optimizar el desempeño del equipo legal mediante SLAs, registro de horas, métricas de productividad y análisis predictivo con inteligencia artificial. El sistema proporciona visibilidad completa sobre la eficiencia operativa, identifica cuellos de botella y ofrece recomendaciones accionables para mejorar la gestión de casos.

## Glossary

- **Productivity_System**: El sistema completo de productividad y control de gestión
- **SLA_Manager**: Componente que gestiona Service Level Agreements por tipo de caso
- **Time_Tracker**: Componente que registra horas trabajadas por abogados
- **Analytics_Engine**: Motor de análisis que calcula métricas de productividad
- **AI_Analyzer**: Componente de inteligencia artificial que analiza estados de casos
- **Dashboard_Renderer**: Componente que visualiza métricas y reportes
- **Alert_System**: Sistema de notificaciones para SLAs y casos en riesgo
- **Case**: Caso legal en el sistema AT INFORMA
- **Lawyer**: Usuario con rol ABOGADO en el sistema
- **Team_Lead**: Usuario con rol JEFE_DE_MESA en el sistema
- **Admin**: Usuario con rol SUPER_ADMIN en el sistema
- **Time_Entry**: Registro individual de tiempo trabajado en un caso
- **Activity_Category**: Categoría de actividad legal (investigación, redacción, audiencia, etc.)
- **SLA_Definition**: Definición de tiempo máximo permitido para un tipo de caso
- **SLA_Status**: Estado de cumplimiento de un SLA (cumplido, en riesgo, incumplido)
- **Productivity_Metric**: Métrica calculada de productividad (casos/día, horas/caso, etc.)
- **Case_Health_Score**: Puntuación de salud de un caso calculada por IA
- **Risk_Level**: Nivel de riesgo de un caso (bajo, medio, alto, crítico)
- **AI_Recommendation**: Recomendación generada por IA para un caso
- **Productivity_Report**: Reporte de productividad para un período específico
- **Lawyer_Ranking**: Clasificación de abogados por productividad
- **Bottleneck**: Cuello de botella identificado en el proceso

## Requirements

### Requirement 1: Gestión de SLAs por Tipo de Caso

**User Story:** Como Team_Lead, quiero definir y monitorear SLAs por categoría de caso, para asegurar que los casos se resuelvan dentro de los tiempos esperados.

#### Acceptance Criteria

1. THE SLA_Manager SHALL permitir crear SLA_Definitions con tiempo máximo en días para cada CaseCategory
2. THE SLA_Manager SHALL permitir editar SLA_Definitions existentes
3. THE SLA_Manager SHALL permitir desactivar SLA_Definitions sin eliminar datos históricos
4. WHEN un Case es creado, THE SLA_Manager SHALL asignar automáticamente el SLA_Definition correspondiente a su CaseCategory
5. THE SLA_Manager SHALL calcular el tiempo transcurrido desde la creación del Case hasta la fecha actual
6. THE SLA_Manager SHALL calcular el tiempo restante hasta el vencimiento del SLA
7. WHEN el tiempo restante es menor al 20% del SLA total, THE SLA_Manager SHALL marcar el SLA_Status como "en riesgo"
8. WHEN el tiempo transcurrido excede el SLA definido, THE SLA_Manager SHALL marcar el SLA_Status como "incumplido"
9. THE SLA_Manager SHALL excluir del cálculo los días en que el Case estuvo en estado HALTED_BY_PAYMENT
10. THE SLA_Manager SHALL registrar la fecha y hora de cada cambio de SLA_Status

### Requirement 2: Sistema de Alertas de SLA

**User Story:** Como Team_Lead, quiero recibir alertas cuando los casos se acerquen o incumplan sus SLAs, para tomar acciones correctivas oportunamente.

#### Acceptance Criteria

1. WHEN un Case cambia a SLA_Status "en riesgo", THE Alert_System SHALL crear una notificación para el Team_Lead asignado
2. WHEN un Case cambia a SLA_Status "incumplido", THE Alert_System SHALL crear una notificación de alta prioridad para el Team_Lead y Admin
3. THE Alert_System SHALL enviar un resumen diario de casos en riesgo a todos los Team_Lead
4. THE Alert_System SHALL incluir en cada alerta el código del Case, tiempo restante y Lawyer asignado
5. WHERE el Admin ha configurado notificaciones por email, THE Alert_System SHALL enviar alertas por email además de notificaciones en sistema
6. THE Alert_System SHALL permitir al Team_Lead marcar alertas como "revisadas"
7. THE Alert_System SHALL mantener un historial de todas las alertas generadas por al menos 90 días

### Requirement 3: Registro de Horas Trabajadas

**User Story:** Como Lawyer, quiero registrar el tiempo que trabajo en cada caso con categorización de actividades, para que mi productividad sea medida con precisión.

#### Acceptance Criteria

1. THE Time_Tracker SHALL permitir al Lawyer crear Time_Entry para un Case específico
2. THE Time_Tracker SHALL requerir que cada Time_Entry incluya fecha, duración en minutos y Activity_Category
3. THE Time_Tracker SHALL soportar las siguientes Activity_Category: "Investigación", "Redacción de documentos", "Audiencias", "Reuniones con cliente", "Gestión administrativa", "Otro"
4. THE Time_Tracker SHALL permitir al Lawyer agregar una descripción opcional de hasta 500 caracteres al Time_Entry
5. THE Time_Tracker SHALL validar que la duración del Time_Entry sea mayor a 0 y menor a 1440 minutos (24 horas)
6. THE Time_Tracker SHALL validar que la fecha del Time_Entry no sea futura
7. THE Time_Tracker SHALL permitir al Lawyer editar Time_Entry creados en los últimos 7 días
8. THE Time_Tracker SHALL permitir al Lawyer eliminar Time_Entry creados en las últimas 24 horas
9. WHERE el Lawyer tiene rol SUPER_ADMIN, THE Time_Tracker SHALL permitir editar cualquier Time_Entry sin restricción de tiempo
10. THE Time_Tracker SHALL registrar automáticamente el userId del Lawyer que crea el Time_Entry
11. THE Time_Tracker SHALL calcular y mostrar el total de horas registradas por Case
12. THE Time_Tracker SHALL calcular y mostrar el total de horas registradas por Lawyer en un período seleccionado

### Requirement 4: Visualización de Historial de Horas

**User Story:** Como Team_Lead, quiero ver el historial completo de horas trabajadas por caso y por abogado, para analizar la distribución del tiempo y detectar ineficiencias.

#### Acceptance Criteria

1. THE Dashboard_Renderer SHALL mostrar una lista de todos los Time_Entry de un Case ordenados por fecha descendente
2. THE Dashboard_Renderer SHALL mostrar para cada Time_Entry: fecha, Lawyer, Activity_Category, duración y descripción
3. THE Dashboard_Renderer SHALL permitir filtrar Time_Entry por rango de fechas
4. THE Dashboard_Renderer SHALL permitir filtrar Time_Entry por Activity_Category
5. THE Dashboard_Renderer SHALL permitir filtrar Time_Entry por Lawyer
6. THE Dashboard_Renderer SHALL mostrar el total de horas por Activity_Category en formato de gráfico de pastel
7. THE Dashboard_Renderer SHALL mostrar el total de horas por Lawyer en formato de gráfico de barras
8. THE Dashboard_Renderer SHALL permitir exportar el historial de Time_Entry a formato CSV
9. WHERE el usuario es un Lawyer sin rol de Team_Lead, THE Dashboard_Renderer SHALL mostrar únicamente los Time_Entry creados por ese Lawyer

### Requirement 5: Métricas de Productividad Individual

**User Story:** Como Team_Lead, quiero ver métricas de productividad de cada abogado, para identificar alto desempeño y áreas de mejora.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL calcular para cada Lawyer el número de Cases asignados en un período seleccionado
2. THE Analytics_Engine SHALL calcular para cada Lawyer el número de Cases finalizados en un período seleccionado
3. THE Analytics_Engine SHALL calcular para cada Lawyer el total de horas registradas en un período seleccionado
4. THE Analytics_Engine SHALL calcular para cada Lawyer el promedio de horas por Case finalizado
5. THE Analytics_Engine SHALL calcular para cada Lawyer el porcentaje de Cases con SLA cumplido
6. THE Analytics_Engine SHALL calcular para cada Lawyer el promedio de días para finalizar un Case
7. THE Analytics_Engine SHALL calcular para cada Lawyer la tasa de éxito (Cases finalizados / Cases asignados)
8. THE Analytics_Engine SHALL actualizar todas las Productivity_Metric cada 6 horas
9. THE Dashboard_Renderer SHALL mostrar todas las Productivity_Metric en una tabla comparativa
10. THE Dashboard_Renderer SHALL permitir ordenar la tabla por cualquier Productivity_Metric
11. THE Dashboard_Renderer SHALL resaltar en verde las métricas que superan el promedio del equipo
12. THE Dashboard_Renderer SHALL resaltar en rojo las métricas que están por debajo del 70% del promedio del equipo

### Requirement 6: Ranking de Productividad

**User Story:** Como Admin, quiero ver un ranking de productividad del equipo, para reconocer el alto desempeño y establecer benchmarks.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL calcular un Lawyer_Ranking basado en un score compuesto de productividad
2. THE Analytics_Engine SHALL calcular el score compuesto usando la fórmula: (Cases finalizados × 40) + (SLA cumplido % × 30) + (Tasa de éxito × 30)
3. THE Analytics_Engine SHALL ordenar a todos los Lawyer por score compuesto de mayor a menor
4. THE Dashboard_Renderer SHALL mostrar el Lawyer_Ranking con posición, nombre, score y métricas clave
5. THE Dashboard_Renderer SHALL mostrar un badge "Top Performer" para los 3 primeros Lawyer del ranking
6. THE Dashboard_Renderer SHALL mostrar la tendencia (subió/bajó posiciones) comparado con el período anterior
7. THE Dashboard_Renderer SHALL permitir seleccionar el período de análisis (última semana, último mes, último trimestre)
8. WHERE el período seleccionado es menor a 7 días, THE Dashboard_Renderer SHALL mostrar una advertencia de que los datos pueden no ser representativos

### Requirement 7: Análisis de Distribución de Actividades

**User Story:** Como Team_Lead, quiero analizar cómo se distribuye el tiempo entre diferentes tipos de actividades, para optimizar la asignación de recursos.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL calcular el total de horas por Activity_Category para todo el equipo en un período seleccionado
2. THE Analytics_Engine SHALL calcular el porcentaje de tiempo dedicado a cada Activity_Category
3. THE Analytics_Engine SHALL calcular el promedio de horas por Activity_Category por Lawyer
4. THE Dashboard_Renderer SHALL mostrar la distribución de actividades en un gráfico de pastel interactivo
5. THE Dashboard_Renderer SHALL mostrar la distribución de actividades por Lawyer en un gráfico de barras apiladas
6. THE Dashboard_Renderer SHALL permitir hacer clic en una Activity_Category para ver el detalle de Time_Entry
7. THE Dashboard_Renderer SHALL mostrar una comparativa entre la distribución actual y la del período anterior
8. WHERE una Activity_Category representa más del 50% del tiempo total, THE Dashboard_Renderer SHALL mostrar una advertencia de posible desbalance

### Requirement 8: Análisis de Estado de Casos con IA

**User Story:** Como Team_Lead, quiero que la IA analice automáticamente el estado de cada caso, para identificar casos en riesgo o estancados sin revisión manual.

#### Acceptance Criteria

1. THE AI_Analyzer SHALL analizar cada Case activo al menos una vez cada 24 horas
2. THE AI_Analyzer SHALL calcular un Case_Health_Score entre 0 y 100 para cada Case
3. THE AI_Analyzer SHALL considerar en el cálculo: tiempo desde última actualización, cumplimiento de SLA, horas registradas, número de comentarios y estado de pago
4. THE AI_Analyzer SHALL asignar un Risk_Level basado en el Case_Health_Score: 80-100 = bajo, 50-79 = medio, 20-49 = alto, 0-19 = crítico
5. WHEN un Case tiene Case_Health_Score menor a 50, THE AI_Analyzer SHALL generar un AI_Recommendation con acciones sugeridas
6. THE AI_Analyzer SHALL detectar Cases sin Time_Entry en los últimos 7 días y marcarlos como "posiblemente estancados"
7. THE AI_Analyzer SHALL detectar Cases con SLA_Status "en riesgo" y sin actividad reciente y marcarlos como "requiere atención urgente"
8. THE AI_Analyzer SHALL registrar la fecha y hora de cada análisis realizado
9. THE AI_Analyzer SHALL almacenar el historial de Case_Health_Score para análisis de tendencias
10. WHERE el análisis de IA falla por error técnico, THE AI_Analyzer SHALL registrar el error y reintentar después de 1 hora

### Requirement 9: Predicciones de Tiempo de Resolución

**User Story:** Como Team_Lead, quiero que la IA prediga el tiempo estimado de resolución de cada caso, para planificar recursos y gestionar expectativas del cliente.

#### Acceptance Criteria

1. THE AI_Analyzer SHALL calcular un tiempo estimado de resolución en días para cada Case activo
2. THE AI_Analyzer SHALL basar la predicción en: CaseCategory, horas ya invertidas, complejidad (is_delicate), y datos históricos de Cases similares finalizados
3. THE AI_Analyzer SHALL calcular un rango de confianza (mínimo-máximo) para la predicción
4. THE AI_Analyzer SHALL actualizar la predicción cada vez que se registra un nuevo Time_Entry o Update en el Case
5. WHERE no existen suficientes datos históricos (menos de 10 Cases similares finalizados), THE AI_Analyzer SHALL usar el SLA_Definition como estimación base
6. THE Dashboard_Renderer SHALL mostrar la predicción de tiempo en la vista de detalle del Case
7. THE Dashboard_Renderer SHALL mostrar el rango de confianza y el nivel de certeza de la predicción
8. THE Dashboard_Renderer SHALL comparar la predicción con el SLA y resaltar si la predicción excede el SLA

### Requirement 10: Recomendaciones Accionables de IA

**User Story:** Como Lawyer, quiero recibir recomendaciones claras de la IA sobre qué acciones tomar en mis casos, para mejorar mi eficiencia y evitar incumplimientos.

#### Acceptance Criteria

1. THE AI_Analyzer SHALL generar AI_Recommendation específicas y accionables para cada Case con Risk_Level medio o superior
2. THE AI_Analyzer SHALL incluir en cada AI_Recommendation: descripción del problema, acción sugerida, prioridad y razón de la recomendación
3. THE AI_Analyzer SHALL priorizar recomendaciones como: "Urgente", "Alta", "Media" o "Baja"
4. THE AI_Analyzer SHALL generar recomendaciones del tipo: "Registrar actualización para el cliente", "Aumentar horas dedicadas", "Solicitar información al cliente", "Revisar documentación pendiente"
5. THE Dashboard_Renderer SHALL mostrar las AI_Recommendation en la vista de detalle del Case
6. THE Dashboard_Renderer SHALL mostrar un badge con el número de recomendaciones pendientes en la lista de Cases
7. THE Dashboard_Renderer SHALL permitir al Lawyer marcar una AI_Recommendation como "completada" o "descartada"
8. WHEN un Lawyer marca una AI_Recommendation como completada, THE AI_Analyzer SHALL registrar la acción y el tiempo de respuesta
9. THE AI_Analyzer SHALL aprender de las recomendaciones descartadas para mejorar futuras sugerencias
10. THE Dashboard_Renderer SHALL mostrar una explicación clara y en lenguaje simple de por qué se generó cada AI_Recommendation

### Requirement 11: Detección de Casos Estancados

**User Story:** Como Team_Lead, quiero que el sistema detecte automáticamente casos estancados, para intervenir antes de que se conviertan en problemas críticos.

#### Acceptance Criteria

1. THE AI_Analyzer SHALL marcar un Case como "estancado" cuando no tiene Time_Entry registrados en los últimos 7 días
2. THE AI_Analyzer SHALL marcar un Case como "estancado" cuando no tiene Update registrados en los últimos 14 días
3. THE AI_Analyzer SHALL marcar un Case como "estancado" cuando no tiene Comment de tipo PUBLIC en los últimos 21 días
4. THE AI_Analyzer SHALL excluir de la detección los Cases en estado HALTED_BY_PAYMENT o WAITING_CUOTAS
5. WHEN un Case es marcado como estancado, THE Alert_System SHALL notificar al Lawyer asignado y al Team_Lead
6. THE Dashboard_Renderer SHALL mostrar una sección dedicada de "Casos Estancados" en el dashboard principal
7. THE Dashboard_Renderer SHALL mostrar para cada Case estancado: días sin actividad, última acción registrada y Lawyer asignado
8. THE Dashboard_Renderer SHALL permitir al Team_Lead reasignar Cases estancados directamente desde la vista
9. WHERE un Case permanece estancado por más de 30 días, THE Alert_System SHALL escalar la notificación al Admin

### Requirement 12: Dashboard de Cumplimiento de SLAs

**User Story:** Como Admin, quiero ver un dashboard consolidado de cumplimiento de SLAs, para evaluar la salud operativa del sistema.

#### Acceptance Criteria

1. THE Dashboard_Renderer SHALL mostrar el porcentaje global de Cases con SLA cumplido
2. THE Dashboard_Renderer SHALL mostrar el porcentaje de cumplimiento de SLA por CaseCategory
3. THE Dashboard_Renderer SHALL mostrar el porcentaje de cumplimiento de SLA por Lawyer
4. THE Dashboard_Renderer SHALL mostrar el número de Cases en cada SLA_Status (cumplido, en riesgo, incumplido)
5. THE Dashboard_Renderer SHALL mostrar un gráfico de tendencia de cumplimiento de SLA en los últimos 6 meses
6. THE Dashboard_Renderer SHALL mostrar el tiempo promedio de resolución por CaseCategory
7. THE Dashboard_Renderer SHALL comparar el tiempo promedio de resolución con el SLA_Definition
8. THE Dashboard_Renderer SHALL resaltar en rojo las CaseCategory con cumplimiento menor al 80%
9. THE Dashboard_Renderer SHALL permitir hacer clic en cualquier métrica para ver el detalle de Cases
10. THE Dashboard_Renderer SHALL actualizar las métricas en tiempo real sin recargar la página

### Requirement 13: Reportes de Gestión Exportables

**User Story:** Como Team_Lead, quiero generar reportes de gestión en formato exportable, para presentar resultados a la dirección y clientes.

#### Acceptance Criteria

1. THE Productivity_System SHALL permitir generar un Productivity_Report para un período seleccionado
2. THE Productivity_Report SHALL incluir: resumen ejecutivo, métricas de productividad, cumplimiento de SLAs, ranking de equipo y casos destacados
3. THE Productivity_System SHALL permitir exportar el Productivity_Report en formato PDF
4. THE Productivity_System SHALL permitir exportar el Productivity_Report en formato Excel con datos tabulares
5. THE Productivity_Report SHALL incluir gráficos visuales de las métricas principales
6. THE Productivity_Report SHALL incluir la fecha de generación y el período analizado
7. THE Productivity_Report SHALL incluir el nombre del Team_Lead o Admin que generó el reporte
8. WHERE el reporte incluye datos de Lawyer específicos, THE Productivity_System SHALL requerir confirmación antes de exportar por privacidad
9. THE Productivity_System SHALL mantener un historial de los últimos 12 Productivity_Report generados
10. THE Productivity_System SHALL permitir regenerar un Productivity_Report histórico con los mismos parámetros

### Requirement 14: Análisis de Cuellos de Botella

**User Story:** Como Admin, quiero identificar cuellos de botella en el proceso legal, para implementar mejoras operativas.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL identificar Bottleneck analizando Activity_Category con mayor tiempo promedio
2. THE Analytics_Engine SHALL identificar Bottleneck analizando CaseCategory con menor tasa de finalización
3. THE Analytics_Engine SHALL identificar Bottleneck analizando Lawyer con mayor carga de Cases activos
4. THE Analytics_Engine SHALL identificar Bottleneck analizando etapas del proceso donde los Cases permanecen más tiempo
5. THE Dashboard_Renderer SHALL mostrar una sección de "Cuellos de Botella Identificados" con descripción y impacto
6. THE Dashboard_Renderer SHALL mostrar para cada Bottleneck: tipo, descripción, impacto estimado y recomendación de mejora
7. THE Dashboard_Renderer SHALL permitir al Admin marcar un Bottleneck como "en resolución" o "resuelto"
8. THE Analytics_Engine SHALL recalcular Bottleneck cada 7 días
9. WHERE un Bottleneck persiste por más de 30 días, THE Dashboard_Renderer SHALL marcarlo como "crítico"

### Requirement 15: Comparativas de Productividad

**User Story:** Como Team_Lead, quiero comparar la productividad entre diferentes períodos, para evaluar el impacto de cambios organizacionales.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL permitir seleccionar dos períodos de tiempo para comparación
2. THE Analytics_Engine SHALL calcular todas las Productivity_Metric para ambos períodos
3. THE Dashboard_Renderer SHALL mostrar una tabla comparativa con las métricas de ambos períodos
4. THE Dashboard_Renderer SHALL calcular y mostrar el porcentaje de cambio para cada métrica
5. THE Dashboard_Renderer SHALL resaltar en verde las métricas que mejoraron
6. THE Dashboard_Renderer SHALL resaltar en rojo las métricas que empeoraron
7. THE Dashboard_Renderer SHALL mostrar gráficos de línea para visualizar la evolución de métricas clave
8. WHERE la diferencia entre períodos es menor al 5%, THE Dashboard_Renderer SHALL marcar el cambio como "sin cambio significativo"

### Requirement 16: Dashboard Moderno e Interactivo

**User Story:** Como usuario del sistema, quiero un dashboard moderno e intuitivo inspirado en LemonKiller-MVP, para acceder fácilmente a la información de productividad.

#### Acceptance Criteria

1. THE Dashboard_Renderer SHALL usar una paleta de colores consistente con AT INFORMA (#C9A84C dorado, #0D1117 oscuro, #F7F5F1 fondo)
2. THE Dashboard_Renderer SHALL mostrar widgets interactivos con animaciones suaves al cargar
3. THE Dashboard_Renderer SHALL usar gráficos modernos con tooltips informativos
4. THE Dashboard_Renderer SHALL responder a interacciones del usuario sin recargar la página completa
5. THE Dashboard_Renderer SHALL adaptar el layout a diferentes tamaños de pantalla (responsive)
6. THE Dashboard_Renderer SHALL mostrar indicadores de carga mientras se calculan métricas
7. THE Dashboard_Renderer SHALL usar iconos claros para cada tipo de métrica
8. THE Dashboard_Renderer SHALL agrupar información relacionada en cards visuales
9. THE Dashboard_Renderer SHALL permitir colapsar y expandir secciones del dashboard
10. THE Dashboard_Renderer SHALL recordar las preferencias de visualización del usuario

### Requirement 17: Integración con Sistema de Casos Existente

**User Story:** Como desarrollador, quiero que el sistema de productividad se integre sin fricciones con el sistema de casos existente, para mantener la consistencia de datos.

#### Acceptance Criteria

1. THE Productivity_System SHALL usar el modelo Case existente de Prisma sin modificar su estructura core
2. THE Productivity_System SHALL crear nuevos modelos de Prisma para Time_Entry, SLA_Definition, AI_Analysis y Productivity_Metric
3. THE Productivity_System SHALL establecer relaciones de foreign key entre nuevos modelos y Case existente
4. THE Productivity_System SHALL usar las enumeraciones Role y CaseCategory existentes
5. THE Productivity_System SHALL respetar los permisos de rol existentes (SUPER_ADMIN, JEFE_DE_MESA, ABOGADO)
6. THE Productivity_System SHALL usar el sistema de autenticación NextAuth existente
7. THE Productivity_System SHALL agregar nuevas rutas bajo /admin/productividad sin modificar rutas existentes
8. THE Productivity_System SHALL usar los componentes UI existentes (ModernHeader, Sidebar, ModernTable) cuando sea posible
9. THE Productivity_System SHALL mantener la arquitectura Next.js App Router existente
10. WHERE se requieren nuevas columnas en Case, THE Productivity_System SHALL usar el campo metadata JSON existente en lugar de modificar el schema

### Requirement 18: Registro Rápido de Horas desde Vista de Caso

**User Story:** Como Lawyer, quiero registrar horas trabajadas directamente desde la vista de detalle del caso, para minimizar interrupciones en mi flujo de trabajo.

#### Acceptance Criteria

1. THE Dashboard_Renderer SHALL mostrar un botón "Registrar Horas" en la vista de detalle del Case
2. WHEN el Lawyer hace clic en "Registrar Horas", THE Dashboard_Renderer SHALL mostrar un formulario modal
3. THE Dashboard_Renderer SHALL pre-llenar el formulario con el Case actual y la fecha de hoy
4. THE Dashboard_Renderer SHALL permitir al Lawyer ingresar duración usando un selector de horas y minutos
5. THE Dashboard_Renderer SHALL permitir al Lawyer seleccionar Activity_Category de un dropdown
6. THE Dashboard_Renderer SHALL validar el formulario antes de enviar
7. WHEN el formulario es válido y enviado, THE Time_Tracker SHALL crear el Time_Entry y cerrar el modal
8. WHEN el Time_Entry es creado exitosamente, THE Dashboard_Renderer SHALL mostrar una notificación de confirmación
9. THE Dashboard_Renderer SHALL actualizar el total de horas del Case sin recargar la página
10. WHERE el Lawyer cancela el formulario, THE Dashboard_Renderer SHALL descartar los datos sin guardar

### Requirement 19: Notificaciones de Productividad

**User Story:** Como Lawyer, quiero recibir notificaciones sobre mi productividad y casos que requieren atención, para mantenerme informado sin revisar constantemente el dashboard.

#### Acceptance Criteria

1. WHEN un Case asignado al Lawyer cambia a SLA_Status "en riesgo", THE Alert_System SHALL crear una notificación para el Lawyer
2. WHEN un Case asignado al Lawyer es marcado como estancado, THE Alert_System SHALL crear una notificación para el Lawyer
3. WHEN el AI_Analyzer genera una AI_Recommendation de prioridad "Urgente" para un Case del Lawyer, THE Alert_System SHALL crear una notificación inmediata
4. THE Alert_System SHALL enviar un resumen semanal de productividad a cada Lawyer con sus métricas principales
5. THE Alert_System SHALL mostrar notificaciones en un panel desplegable en el header
6. THE Alert_System SHALL mostrar un badge con el número de notificaciones no leídas
7. THE Alert_System SHALL permitir al Lawyer marcar notificaciones como leídas
8. THE Alert_System SHALL permitir al Lawyer configurar qué tipos de notificaciones desea recibir
9. WHERE el Lawyer no ha registrado Time_Entry en 3 días, THE Alert_System SHALL enviar un recordatorio amigable
10. THE Alert_System SHALL mantener las notificaciones por 30 días antes de archivarlas

### Requirement 20: Explicabilidad de Análisis de IA

**User Story:** Como usuario del sistema, quiero entender claramente cómo la IA llegó a sus conclusiones, para confiar en las recomendaciones y tomar decisiones informadas.

#### Acceptance Criteria

1. THE AI_Analyzer SHALL generar una explicación en lenguaje simple para cada Case_Health_Score calculado
2. THE AI_Analyzer SHALL listar los factores específicos que contribuyeron al Case_Health_Score con su peso relativo
3. THE AI_Analyzer SHALL explicar por qué se asignó un Risk_Level específico
4. THE AI_Analyzer SHALL explicar la lógica detrás de cada AI_Recommendation generada
5. THE Dashboard_Renderer SHALL mostrar un ícono de información junto a cada métrica de IA
6. WHEN el usuario hace clic en el ícono de información, THE Dashboard_Renderer SHALL mostrar la explicación detallada en un tooltip o modal
7. THE AI_Analyzer SHALL evitar jerga técnica en las explicaciones y usar términos comprensibles para usuarios no técnicos
8. THE AI_Analyzer SHALL incluir ejemplos concretos cuando sea posible (ej: "Este caso no tiene actualizaciones desde hace 12 días")
9. THE Dashboard_Renderer SHALL mostrar un enlace a documentación sobre cómo funciona el análisis de IA
10. WHERE el análisis de IA tiene baja confianza, THE Dashboard_Renderer SHALL indicar claramente el nivel de incertidumbre

---

## Document Status

**Version:** 1.0  
**Status:** Initial Draft  
**Created:** 2025-01-28  
**Last Updated:** 2025-01-28

Este documento de requirements está listo para revisión. Todos los requirements siguen los patrones EARS y cumplen con las reglas de calidad INCOSE. El sistema está diseñado para integrarse sin fricciones con la arquitectura existente de AT INFORMA.
