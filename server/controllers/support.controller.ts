import { Request, Response } from 'express';
import { supportService } from '../services/support.service.js';

export class SupportController {
  async createTicket(req: Request, res: Response) {
    try {
      const ticket = await supportService.createTicket(req.body);
      res.status(201).json({
        ok: true,
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
          notification_status: ticket.notification_status,
        },
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async listTickets(req: Request, res: Response) {
    try {
      const tickets = await supportService.listTickets({
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      const stats = await supportService.getStats();
      res.json({ ok: true, tickets, stats });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async updateTicket(req: Request, res: Response) {
    try {
      const ticket = await supportService.updateTicket(req.params.id, req.body);
      res.json({ ok: true, ticket });
    } catch (error: any) {
      res.status(error.code === 'P2025' ? 404 : 500).json({ ok: false, message: error.message });
    }
  }
}

export const supportController = new SupportController();
