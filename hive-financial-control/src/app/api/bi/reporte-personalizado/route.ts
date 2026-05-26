import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entidad = searchParams.get("entidad") ?? "clientes";
  const estado = searchParams.get("estado") || undefined;

  try {
    switch (entidad) {
      case "clientes": {
        const data = await prisma.cliente.findMany({
          where: estado ? { estado: estado as never } : {},
          select: { nombre: true, rut: true, tipo_cliente: true, estado: true, fecha_ingreso: true },
          orderBy: { nombre: "asc" },
          take: 500,
        });
        return NextResponse.json(data.map(d => ({ ...d, fecha_ingreso: d.fecha_ingreso?.toISOString().slice(0, 10) })));
      }
      case "contratos": {
        const data = await prisma.contrato.findMany({
          where: estado ? { estado: estado as never } : {},
          include: { cliente: { select: { nombre: true } } },
          orderBy: { created_at: "desc" },
          take: 500,
        });
        return NextResponse.json(data.map(d => ({
          "cliente.nombre": d.cliente.nombre,
          tipo_servicio: d.tipo_servicio,
          monto_ccto: Number(d.monto_ccto),
          estado: d.estado,
          fecha_contrato: d.fecha_contrato?.toISOString().slice(0, 10),
          cantidad_cuotas_original: d.cantidad_cuotas_original,
        })));
      }
      case "pagos": {
        const data = await prisma.pago.findMany({
          where: estado ? { estado: estado as never } : {},
          include: { cliente: { select: { nombre: true } } },
          orderBy: { fecha_pago: "desc" },
          take: 500,
        });
        return NextResponse.json(data.map(d => ({
          "cliente.nombre": d.cliente.nombre,
          fecha_pago: d.fecha_pago?.toISOString().slice(0, 10),
          monto_pagado: Number(d.monto_pagado),
          medio_pago: d.medio_pago,
          estado: d.estado,
        })));
      }
      case "cuotas": {
        const data = await prisma.cuota.findMany({
          where: estado ? { estado: estado as never } : {},
          include: { contrato: { include: { cliente: { select: { nombre: true } } } } },
          orderBy: { fecha_vencimiento: "asc" },
          take: 500,
        });
        return NextResponse.json(data.map(d => ({
          "contrato.cliente.nombre": d.contrato.cliente.nombre,
          numero_cuota: d.numero_cuota,
          monto_actual: Number(d.monto_actual),
          fecha_vencimiento: d.fecha_vencimiento?.toISOString().slice(0, 10),
          estado: d.estado,
          saldo_pendiente: Number(d.saldo_pendiente),
        })));
      }
      case "gestiones": {
        const data = await prisma.gestionCobranza.findMany({
          include: { cliente: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
          orderBy: { fecha_gestion: "desc" },
          take: 500,
        });
        return NextResponse.json(data.map(d => ({
          "cliente.nombre": d.cliente.nombre,
          fecha_gestion: d.fecha_gestion?.toISOString().slice(0, 10),
          tipo: d.tipo,
          resultado: d.resultado,
          "usuario.nombre": d.usuario.nombre,
        })));
      }
      default:
        return NextResponse.json([]);
    }
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
