from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.leads import _cleanup_lead_delete_dependencies


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_cleanup_lead_delete_dependencies_removes_event_notifications_and_ai_logs():
    db = _session()
    try:
        group = models.Group(name="Negocio")
        db.add(group)
        db.flush()

        user = models.User(
            name="Admin",
            email="admin@test.cl",
            password_hash="x",
            role="superadmin",
            group_id=group.id,
        )
        db.add(user)
        db.flush()

        area = models.Area(name="Tributario", group_id=group.id)
        db.add(area)
        db.flush()

        contact = models.Contact(name="Cliente", phone="+56900000000", group_id=group.id, created_by=user.id)
        db.add(contact)
        db.flush()

        lead = models.Lead(
            contact_id=contact.id,
            area_id=area.id,
            group_id=group.id,
            agendadora_id=user.id,
            vendedor_id=user.id,
        )
        db.add(lead)
        db.flush()

        event = models.CalendarEvent(
            title="Reunión",
            lead_id=lead.id,
            contact_id=contact.id,
            created_by=user.id,
            assigned_to=user.id,
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(event)
        db.flush()

        agent = models.AIAgent(name="Bot", openai_api_key="key", system_prompt="prompt", group_id=group.id)
        db.add(agent)
        db.flush()

        db.add(models.Notification(
            user_id=user.id,
            title="Evento",
            message="Notificación con evento",
            lead_id=lead.id,
            event_id=event.id,
        ))
        db.add(models.AIAgentLog(agent_id=agent.id, contact_id=contact.id, lead_id=lead.id))
        db.commit()

        _cleanup_lead_delete_dependencies(db, lead.id)
        db.delete(lead)
        db.commit()

        assert db.query(models.Lead).count() == 0
        assert db.query(models.CalendarEvent).count() == 0
        assert db.query(models.Notification).count() == 0
        assert db.query(models.AIAgentLog).count() == 0
    finally:
        db.close()
