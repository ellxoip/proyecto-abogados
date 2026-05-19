# Design Document: Sistema de Productividad y Control de Gestión con IA

## Overview

El Sistema de Productividad y Control de Gestión con IA es una extensión integral del Legal Operating System AT INFORMA que proporciona capacidades avanzadas de medición, análisis y optimización del desempeño del equipo legal. El sistema se integra sin fricciones con la arquitectura existente, respetando todos los patrones establecidos de Next.js 14 App Router, Prisma ORM con RLS, NextAuth v5, y BullMQ para procesamiento asíncrono.

### Design Principles

1. **Non-Invasive Integration**: No modificar modelos existentes (User, Case, etc.) - usar relaciones y nuevos modelos
2. **RLS-First**: Todas las queries de datos sensibles usan `withRls()` para seguridad
3. **Server-First Architecture**: Server Components por defecto, Client Components solo cuando necesario
4. **Consistent UI/UX**: Mantener paleta de colores (#C9A84C dorado, #0D1117 oscuro, #F7F5F1 fondo) y componentes existentes
5. **Async Processing**: Jobs pesados (análisis de IA, cálculo de métricas) en BullMQ workers
6. **Real-time Updates**: Métricas actualizadas sin recargar página usando React Query
7. **Explainable AI**: Todas las decisiones de IA deben ser explicables en lenguaje simple

---

## Architecture

### System Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[Next.js 14 App Router]
        B[Server Components]
        C[Client Components]
        D[Server Actions]
    end
    
    subgraph "Business Logic Layer"
        E[Time Tracker Service]
        F[SLA Manager Service]
        G[Analytics Engine]
        H[AI Analyzer Service]
    end
    
    subgraph "Data Layer"
        I[Prisma ORM + RLS]
        J[PostgreSQL]
        K[Redis Cache]
    end
    
    subgraph "Background Processing"
        L[BullMQ Queues]
        M[AI Analysis Worker]
        N[Metrics Calculation Worker]
        O[SLA Monitor Worker]
    end
    
    subgraph "External Services"
        P[OpenAI API]
        Q[Notification System]
    end
    
    A --> B
    A --> C
    C --> D
    B --> D
    D --> E
    D --> F
    D --> G
    D --> H
    E --> I
    F --> I
    G --> I
    H --> I
    I --> J
    G --> K
    H --> K
    L --> M
    L --> N
    L --> O
    M --> H
    M --> P
    N --> G
    O --> F
    O --> Q
    
    style A fill:#C9A84C
    style J fill:#0D1117,color:#fff
    style P fill:#2A6B4F,color:#fff
