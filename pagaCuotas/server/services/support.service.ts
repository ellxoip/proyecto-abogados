import crypto from 'crypto';
import net from 'net';
import tls from 'tls';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export type CreateSupportTicketInput = {
  requester_identifier: string;
  requester_name?: string;
  requester_email?: string;
  requester_phone?: string;
  subject: string;
  category: string;
  priority?: string;
  message: string;
  source?: string;
};

function createTicketNumber() {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomInt(1000, 9999);
  return `PC-${ymd}-${suffix}`;
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function readLine(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\n')) {
        socket.off('data', onData);
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

async function command(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`);
  return readLine(socket);
}

function parseEmailAddress(value?: string | null) {
  if (!value) return '';
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

async function sendSmtpMail(params: { to: string; subject: string; text: string }) {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER!;
  const password = process.env.SMTP_PASSWORD!;
  const from = process.env.SMTP_FROM || user;
  const fromAddress = parseEmailAddress(from);

  let socket: net.Socket = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  await readLine(socket);
  await command(socket, `EHLO ${process.env.APP_URL || 'pagacuotas.local'}`);

  if (port !== 465) {
    await command(socket, 'STARTTLS');
    socket = tls.connect({ socket, host, servername: host });
    await readLine(socket);
    await command(socket, `EHLO ${process.env.APP_URL || 'pagacuotas.local'}`);
  }

  await command(socket, 'AUTH LOGIN');
  await command(socket, Buffer.from(user).toString('base64'));
  await command(socket, Buffer.from(password).toString('base64'));
  await command(socket, `MAIL FROM:<${fromAddress}>`);
  await command(socket, `RCPT TO:<${params.to}>`);
  await command(socket, 'DATA');
  socket.write([
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.text,
    '.',
    '',
  ].join('\r\n'));
  await readLine(socket);
  await command(socket, 'QUIT');
  socket.end();
}

export class SupportService {
  async createTicket(input: CreateSupportTicketInput) {
    const ticket = await prisma.supportTicket.create({
      data: {
        ticket_number: createTicketNumber(),
        requester_identifier: input.requester_identifier,
        requester_name: input.requester_name || null,
        requester_email: input.requester_email || null,
        requester_phone: input.requester_phone || null,
        subject: input.subject,
        category: input.category,
        priority: input.priority || 'normal',
        message: input.message,
        source: input.source || 'client_portal',
      },
    });

    // Wait for notification to complete so the response carries the real notification_status.
    // The ticket itself is already persisted; failure here only affects the admin alert.
    await this.notifyAdmin(ticket.id).catch((error) => {
      logger.error('Support admin notification failed', { ticketId: ticket.id, error: error.message });
    });

    const fresh = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
    return fresh || ticket;
  }

  async listTickets(params: { status?: string; limit?: number }) {
    return prisma.supportTicket.findMany({
      where: params.status ? { status: params.status } : {},
      orderBy: { created_at: 'desc' },
      take: Math.min(params.limit || 50, 100),
    });
  }

  async getTicket(id: string) {
    return prisma.supportTicket.findUnique({ where: { id } });
  }

  async updateTicket(id: string, input: { status?: string; admin_response?: string; assigned_to?: string }) {
    return prisma.supportTicket.update({
      where: { id },
      data: {
        status: input.status,
        admin_response: input.admin_response,
        assigned_to: input.assigned_to,
        answered_at: input.admin_response ? new Date() : undefined,
      },
    });
  }

  async getStats() {
    const [open, inProgress, answered, closed] = await Promise.all([
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.supportTicket.count({ where: { status: 'in_progress' } }),
      prisma.supportTicket.count({ where: { status: 'answered' } }),
      prisma.supportTicket.count({ where: { status: 'closed' } }),
    ]);

    return { open, in_progress: inProgress, answered, closed };
  }

  private async notifyAdmin(ticketId: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return;

    const adminEmail = process.env.SUPPORT_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
    if (!adminEmail || !hasSmtpConfig()) {
      const reason = !adminEmail
        ? 'SUPPORT_ADMIN_EMAIL/ADMIN_EMAIL no configurado'
        : 'SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASSWORD)';
      logger.warn('Support ticket was not emailed to admin', {
        ticketNumber: ticket.ticket_number,
        reason,
      });
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          notification_status: 'skipped',
          notification_error: `${reason}. El ticket fue guardado, revisalo en el panel admin.`,
        },
      });
      return;
    }

    try {
      await sendSmtpMail({
        to: adminEmail,
        subject: `[PagaCuotas] Nueva solicitud ${ticket.ticket_number}`,
        text: [
          `Ticket: ${ticket.ticket_number}`,
          `Cliente: ${ticket.requester_name || ticket.requester_identifier}`,
          `Email: ${ticket.requester_email || '-'}`,
          `Telefono: ${ticket.requester_phone || '-'}`,
          `Categoria: ${ticket.category}`,
          `Prioridad: ${ticket.priority}`,
          `Asunto: ${ticket.subject}`,
          '',
          ticket.message,
        ].join('\n'),
      });

      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { notification_status: 'sent', notification_error: null },
      });
    } catch (error: any) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { notification_status: 'failed', notification_error: error.message },
      });
    }
  }
}

export const supportService = new SupportService();
