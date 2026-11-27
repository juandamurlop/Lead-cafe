"""Azure Functions entrypoints for Lote Claro WhatsApp webhook and queue worker."""

from __future__ import annotations

import json
import logging
import os

import azure.functions as func
from azure.storage.queue import QueueClient, TextBase64EncodePolicy

from api.cafeto import handle_get_cafeto_acopio, handle_get_cafeto_base
from api.lots import handle_get_lot, handle_list_lots, handle_verify_lot, to_json
from handlers.audio import handle_audio
from handlers.delivery import handle_delivery
from services.gfw import GfwClient
from handlers.location import handle_location
from handlers.registration import handle_registration
from services.evidence import EvidenceUploader
from services.foundry import FoundryClient
from services.store import PostgresStore
from services.whatsapp import WhatsAppClient
from webhook.enqueue import enqueue_messages, extract_messages
from webhook.verify import verify_challenge, verify_signature

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


@app.route(route="dashboard/summary", methods=["GET"])
def dashboard_summary(req: func.HttpRequest) -> func.HttpResponse:
    """Expose the aggregate dashboard counters when explicitly enabled."""
    if os.environ.get("DASHBOARD_SUMMARY_ENABLED") != "true":
        return func.HttpResponse(status_code=404)

    try:
        summary = PostgresStore(os.environ["DATABASE_URL"]).dashboard_summary()
    except Exception:
        logging.exception("Could not load dashboard summary")
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        json.dumps(summary),
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


@app.route(route="cafeto/base", methods=["GET"])
def get_cafeto_base(req: func.HttpRequest) -> func.HttpResponse:
    """Return the Cafeto supervision base (farms, lots, inputs, photos, compliance rows)."""
    try:
        store = PostgresStore(os.environ["DATABASE_URL"])
        status_code, payload = handle_get_cafeto_base(store)
    except Exception:
        logging.exception("Could not load Cafeto base")
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        to_json(payload),
        status_code=status_code,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


@app.route(route="cafeto/acopio", methods=["GET"])
def get_cafeto_acopio(req: func.HttpRequest) -> func.HttpResponse:
    """Return the acopio sheets (Recepción, Consolidación, Bodega) for the Cafeto dashboard."""
    try:
        store = PostgresStore(os.environ["DATABASE_URL"])
        status_code, payload = handle_get_cafeto_acopio(store)
    except Exception:
        logging.exception("Could not load Cafeto acopio")
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        to_json(payload),
        status_code=status_code,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


@app.route(route="lots", methods=["GET"])
def list_lots(req: func.HttpRequest) -> func.HttpResponse:
    """Return lots, EUDR farm polygons, and GFW statuses for the compliance dashboard."""
    try:
        store = PostgresStore(os.environ["DATABASE_URL"])
        status_code, payload = handle_list_lots(
            store,
            gfw_status=req.params.get("gfw_status"),
            search=req.params.get("search"),
        )
    except Exception:
        logging.exception("Could not list lots")
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        to_json(payload),
        status_code=status_code,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


@app.route(route="lots/{lot_code}", methods=["GET"])
def get_lot(req: func.HttpRequest) -> func.HttpResponse:
    """Return a single lot's polygon, evidence link, and EPCIS 2.0 timeline."""
    lot_code = req.route_params.get("lot_code", "")
    try:
        store = PostgresStore(os.environ["DATABASE_URL"])
        status_code, payload = handle_get_lot(store, lot_code)
    except Exception:
        logging.exception("Could not fetch lot %s", lot_code)
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        to_json(payload),
        status_code=status_code,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


@app.route(route="lots/{lot_code}/verify", methods=["POST"])
def verify_lot(req: func.HttpRequest) -> func.HttpResponse:
    """Mark a lot's producer as verified by the cooperative."""
    lot_code = req.route_params.get("lot_code", "")
    try:
        store = PostgresStore(os.environ["DATABASE_URL"])
        status_code, payload = handle_verify_lot(store, lot_code)
    except Exception:
        logging.exception("Could not verify lot %s", lot_code)
        return func.HttpResponse(status_code=503)

    return func.HttpResponse(
        to_json(payload),
        status_code=status_code,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )
    conn_str = os.environ["AzureWebJobsStorage"]
    queue_name = os.environ.get("WHATSAPP_QUEUE_NAME", "whatsapp-inbound")
    # The Functions queue trigger expects Base64 messages by default.
    return QueueClient.from_connection_string(
        conn_str, queue_name, message_encode_policy=TextBase64EncodePolicy()
    )


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
        logging.warning(
            "Webhook rejected: invalid signature (header present=%s, app secret set=%s)",
            bool(signature),
            bool(app_secret),
        )
        return func.HttpResponse("Invalid signature", status_code=403)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logging.warning("Webhook rejected: invalid JSON body")
        return func.HttpResponse("Invalid JSON", status_code=400)

    envelopes = extract_messages(payload)
    if envelopes:
        enqueue_messages(envelopes, _get_queue_client())
        logging.info("Webhook enqueued %d message(s)", len(envelopes))
    else:
        logging.info("Webhook received payload with no inbound messages (e.g. status update)")

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
    logging.info(
        "Processing message %s type=%s from ...%s", source_message_id, envelope.get("type"), wa_id[-4:]
    )

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
        chat_model=os.environ.get("FOUNDRY_CHAT_MODEL", "gpt-4.1-mini"),
        chat_endpoint=os.environ.get("FOUNDRY_CHAT_ENDPOINT"),
        chat_api_key=os.environ.get("FOUNDRY_CHAT_API_KEY"),
    )

    handled = handle_registration(envelope, store, whatsapp, foundry)
    if handled:
        logging.info("Message %s handled by registration flow", source_message_id)
        return

    if handle_delivery(envelope, store, whatsapp, foundry):
        logging.info("Message %s handled by delivery flow", source_message_id)
        return

    if handle_audio(envelope, store, whatsapp, foundry):
        logging.info("Message %s handled by audio flow", source_message_id)
        return

    gfw_key = os.environ.get("GFW_API_KEY")
    gfw = GfwClient(gfw_key) if gfw_key else None
    evidence = EvidenceUploader.from_env()
    if handle_location(envelope, store, whatsapp, gfw, evidence):
        logging.info("Message %s handled by location flow", source_message_id)
        return

    logging.info("Registered user %s sent message type %s (handlers pending)", wa_id, envelope.get("type"))
