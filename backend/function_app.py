"""Azure Functions entrypoints for Lote Claro WhatsApp webhook and queue worker."""

from __future__ import annotations

import json
import logging
import os

import azure.functions as func
from azure.storage.queue import QueueClient

from handlers.registration import handle_registration
from services.foundry import FoundryClient
from services.store import PostgresStore
from services.whatsapp import WhatsAppClient
from webhook.enqueue import enqueue_messages, extract_messages
from webhook.verify import verify_challenge, verify_signature

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def _get_queue_client() -> QueueClient:
    conn_str = os.environ["AzureWebJobsStorage"]
    queue_name = os.environ.get("WHATSAPP_QUEUE_NAME", "whatsapp-inbound")
    client = QueueClient.from_connection_string(conn_str, queue_name)
    return client


@app.route(route="webhook", methods=["GET", "POST"])
def whatsapp_webhook(req: func.HttpRequest) -> func.HttpResponse:
    """DB-free WhatsApp webhook: verify challenge/signature, enqueue, return 200 OK."""
    if req.method == "GET":
        status_code, body = verify_challenge(
            req.params,
            os.environ.get("WHATSAPP_VERIFY_TOKEN", ""),
        )
        return func.HttpResponse(body, status_code=status_code)

    raw_body = req.get_body()
    app_secret = os.environ.get("META_APP_SECRET", "")
    signature = req.headers.get("X-Hub-Signature-256")
    if not verify_signature(raw_body, signature, app_secret):
        return func.HttpResponse("Invalid signature", status_code=403)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return func.HttpResponse("Invalid JSON", status_code=400)

    envelopes = extract_messages(payload)
    if envelopes:
        enqueue_messages(envelopes, _get_queue_client())

    return func.HttpResponse("OK", status_code=200)


@app.queue_trigger(
    arg_name="msg",
    queue_name="%WHATSAPP_QUEUE_NAME%",
    connection="AzureWebJobsStorage",
)
def process_whatsapp_message(msg: func.QueueMessage) -> None:
    """Idempotent queue worker that routes inbound WhatsApp messages."""
    envelope = json.loads(msg.get_body().decode("utf-8"))
    source_message_id = envelope["source_message_id"]
    wa_id = envelope["wa_id"]

    store = PostgresStore(os.environ["DATABASE_URL"])
    if not store.mark_message_processed(source_message_id, wa_id):
        logging.info("Skipping duplicate message %s", source_message_id)
        return

    whatsapp = WhatsAppClient(
        access_token=os.environ["WHATSAPP_ACCESS_TOKEN"],
        phone_number_id=os.environ["WHATSAPP_PHONE_NUMBER_ID"],
    )
    foundry = FoundryClient(
        endpoint=os.environ["FOUNDRY_ENDPOINT"],
        api_key=os.environ["FOUNDRY_API_KEY"],
        model=os.environ.get("FOUNDRY_MODEL", "gpt-4o-transcribe"),
    )

    handled = handle_registration(envelope, store, whatsapp, foundry)
    if handled:
        return

    logging.info("Registered user %s sent message type %s (handlers pending)", wa_id, envelope.get("type"))
