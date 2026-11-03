"""
app.py - Main Flask Application Server for Police Complaint Documentation System
Exposes routes for 3-column interactive workspace, history dashboard,
zero-hallucination multi-turn extraction, AI Co-Pilot chat, persistent SQLite CRUD,
and ReportLab PDF compilation and download.
"""

import io
import os
import json
import logging
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for

import database
import extraction
import pdf_generator

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "police_mtech_secure_key_2026")

# Station details from environment
STATION_NAME = os.getenv("POLICE_STATION_NAME", "Central Police Station, Law & Order Division")
POLICE_DISTRICT = os.getenv("POLICE_DISTRICT", "Chennai City Police / Tamil Nadu Police")

UPLOAD_AUDIO_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads", "audio")
os.makedirs(UPLOAD_AUDIO_FOLDER, exist_ok=True)


# -------------------------------------------------------------
# PAGE ROUTES
# -------------------------------------------------------------

@app.route("/")
def index():
    """Main 3-Column Interactive Police Workspace."""
    return render_template(
        "index.html",
        station_name=STATION_NAME,
        district_name=POLICE_DISTRICT,
        current_year=datetime.now().year
    )


@app.route("/history")
def history():
    """Saved Police Records, CSR Archive & Search Dashboard."""
    return render_template(
        "history.html",
        station_name=STATION_NAME,
        district_name=POLICE_DISTRICT,
        current_year=datetime.now().year
    )


# -------------------------------------------------------------
# REST API ENDPOINTS
# -------------------------------------------------------------

@app.route("/api/init-session", methods=["POST", "GET"])
def api_init_session():
    """
    Initialize a new continuous complaint intake session.
    Generates and returns an authoritative Police Reference ID: POL-YYYYMMDD-XXXX.
    Enables single continuous audio archiving from the very start of the session.
    """
    try:
        ref_id = database.generate_reference_id()
        return jsonify({
            "success": True,
            "reference_id": ref_id,
            "session_time": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "audio_target_filename": f"{ref_id}.webm",
            "message": "Continuous intake session initialized."
        })
    except Exception as e:
        logger.error(f"Init session error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/upload-audio", methods=["POST"])
def api_upload_audio():
    """
    Single Continuous Audio Archiving (Storage Optimization):
    Receives raw audio for the entire intake session from start to end,
    saves it in static/uploads/audio/POL-[REF_ID].webm (or .wav),
    completely eliminating fragmented audio files and optimizing storage.
    Overwrites previous temporary session drafts for the same reference ID.
    """
    try:
        if "audio" not in request.files:
            return jsonify({"success": False, "error": "No audio file provided in request"}), 400

        audio_file = request.files["audio"]
        if audio_file.filename == "":
            return jsonify({"success": False, "error": "Empty audio file received"}), 400

        raw_ref_id = request.form.get("reference_id", "").strip()
        if not raw_ref_id or raw_ref_id.lower() in ("draft", "null", "undefined", "pol-new-draft"):
            ref_id = database.generate_reference_id()
        else:
            ref_id = raw_ref_id.replace("/", "_").replace(" ", "_")
            if not ref_id.startswith("POL-"):
                ref_id = f"POL-{ref_id}"

        ext = ".webm"
        if "." in audio_file.filename:
            candidate_ext = "." + audio_file.filename.rsplit(".", 1)[1].lower()
            if candidate_ext in [".webm", ".wav", ".ogg", ".mp3", ".m4a"]:
                ext = candidate_ext

        # Standardized Single Continuous Audio File name: POL-[REF_ID].webm
        filename = f"{ref_id}{ext}"
        filepath = os.path.join(UPLOAD_AUDIO_FOLDER, filename)
        
        # Save or overwrite ensuring a single continuous master file per session
        audio_file.save(filepath)

        audio_url = f"/static/uploads/audio/{filename}"
        duration = request.form.get("duration", "N/A")
        vad_stats = request.form.get("vad_stats", "Smart Auto-Pause VAD Active (>2s silence paused)")

        logger.info(f"Single continuous audio session saved: {filepath} ({duration})")

        return jsonify({
            "success": True,
            "reference_id": ref_id,
            "filename": filename,
            "audio_url": audio_url,
            "filepath": filepath,
            "timestamp": datetime.now().strftime("%d-%m-%Y %H:%M:%S"),
            "duration": duration,
            "vad_stats": vad_stats,
            "message": f"Single continuous audio successfully archived in static/uploads/audio/{filename}"
        })

    except Exception as e:
        logger.error(f"Audio upload error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/process-statement", methods=["POST"])
@app.route("/api/extract", methods=["POST"])
def api_process_statement():
    """
    Process citizen oral/written statement with multi-turn iterative merging.
    Accepts:
      - accumulated_transcript / raw_transcript / transcript / statement
      - new_input (str): new speech/text addition
      - writer_name (str)
      - complainant_name (str)
      - contact_number (str)
      - father_name (str)
      - residential_address (str)
      - govt_id_masked (str)
    """
    try:
        data = request.get_json() or {}
        raw_transcript = (
            data.get("accumulated_transcript") or
            data.get("raw_transcript") or
            data.get("transcript") or
            data.get("statement") or
            ""
        )
        new_input = data.get("new_input", "")
        writer_name = data.get("writer_name", "Duty Officer")
        complainant_name = data.get("complainant_name", "Citizen")
        contact_number = data.get("contact_number", "")
        father_name = data.get("father_name", "")
        residential_address = data.get("residential_address", "")
        govt_id_masked = data.get("govt_id_masked", "")

        result = extraction.process_statement(
            transcript=raw_transcript,
            new_input=new_input,
            station_writer_name=writer_name,
            complainant_name=complainant_name,
            contact_number=contact_number,
            father_name=father_name,
            residential_address=residential_address,
            govt_id_masked=govt_id_masked
        )

        return jsonify({
            "success": True,
            "data": result,
            "accumulated_transcript": result.get("raw_transcript", raw_transcript)
        })

    except Exception as e:
        logger.error(f"Process statement error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


api_extract = api_process_statement


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    Interactive Police Station AI Co-Pilot.
    Advises officer on legal BNS/IPC sections, procedural steps, and evidence.
    """
    try:
        data = request.get_json() or {}
        message = data.get("message", "").strip()
        context = data.get("context", {})

        if not message:
            return jsonify({"success": False, "error": "Message is required"}), 400

        advice = extraction.generate_copilot_advice(message, context)
        return jsonify({"success": True, "data": advice})

    except Exception as e:
        logger.error(f"Chat Co-Pilot error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/save", methods=["POST"])
def api_save():
    """Save or update a complaint record in SQLite database."""
    try:
        data = request.get_json() or {}

        # Complainant name
        complainant_name = (
            data.get("complainant_name") or
            data.get("name") or
            "Citizen"
        ).strip()
        data["complainant_name"] = complainant_name

        # Normalization of draft and transcript aliases
        draft_complaint = (
            data.get("draft_complaint") or
            data.get("reviewed_draft") or
            data.get("english_draft") or
            data.get("formal_complaint_draft") or
            ""
        ).strip()
        data["draft_complaint"] = draft_complaint

        raw_transcript = (
            data.get("raw_transcript") or
            data.get("transcript") or
            data.get("statement") or
            data.get("accumulated_transcript") or
            draft_complaint
        ).strip()
        data["raw_transcript"] = raw_transcript

        # Validate mandatory fields
        if not complainant_name:
            return jsonify({"success": False, "error": "Complainant Name is required."}), 400

        if not raw_transcript and not draft_complaint and not data.get("audio_filename"):
            return jsonify({"success": False, "error": "Complaint statement, draft, or audio recording is required."}), 400

        # Category normalization
        data["incident_type"] = (
            data.get("incident_category") or
            data.get("incident_type") or
            data.get("category") or
            "General"
        ).strip()

        # Status normalization
        raw_status = (data.get("status") or "").strip()
        if raw_status:
            up = raw_status.upper()
            if up in ("DRAFT", "DRAFTS", "PENDING"):
                normalized_status = "Draft"
            elif up in ("APPROVED", "FINALIZED"):
                normalized_status = "Approved"
            elif up in ("SAVED", "REGISTERED", "REGISTERED_CSR"):
                normalized_status = "Saved"
            else:
                normalized_status = raw_status
        else:
            normalized_status = "Saved"
        data["status"] = normalized_status

        # Save record
        saved = database.save_complaint(data)
        return jsonify({
            "success": True,
            "message": f"Complaint successfully recorded in Police Database (Status: {normalized_status}).",
            "data": saved
        })

    except Exception as e:
        logger.error(f"Save error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/complaints", methods=["GET"])
def api_list_complaints():
    """Search and list complaints with query, status, and category filters."""
    try:
        query = request.args.get("query", "").strip()
        status = request.args.get("status", "").strip()
        category = request.args.get("category", "").strip()
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))

        records = database.search_complaints(
            query=query,
            status=status,
            category=category,
            limit=limit,
            offset=offset
        )
        return jsonify({"success": True, "count": len(records), "data": records})

    except Exception as e:
        logger.error(f"List error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/complaints/<ref_or_id>", methods=["GET"])
def api_get_complaint(ref_or_id):
    """Retrieve full details for a single complaint."""
    try:
        record = database.get_complaint(ref_or_id)
        if not record:
            return jsonify({"success": False, "error": "Complaint record not found"}), 404

        return jsonify({"success": True, "data": record})

    except Exception as e:
        logger.error(f"Get complaint error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/complaints/<ref_or_id>", methods=["DELETE"])
def api_delete_complaint(ref_or_id):
    """Delete a complaint record."""
    try:
        deleted = database.delete_complaint(ref_or_id)
        if not deleted:
            return jsonify({"success": False, "error": "Record not found or already deleted"}), 404

        return jsonify({"success": True, "message": "Record successfully removed."})

    except Exception as e:
        logger.error(f"Delete complaint error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/complaints/<ref_or_id>/status", methods=["POST"])
def api_update_status(ref_or_id):
    """Update status of a complaint (e.g. APPROVED, REGISTERED_CSR, DRAFT)."""
    try:
        data = request.get_json() or {}
        new_status = data.get("status")
        if not new_status:
            return jsonify({"success": False, "error": "New status is required"}), 400

        updated = database.update_status(ref_or_id, new_status)
        if not updated:
            return jsonify({"success": False, "error": "Record not found"}), 404

        return jsonify({"success": True, "message": f"Status updated to {new_status}"})

    except Exception as e:
        logger.error(f"Status update error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/export-pdf/<ref_or_id>", methods=["GET"])
@app.route("/api/complaints/<ref_or_id>/pdf", methods=["GET"])
def api_export_pdf(ref_or_id):
    """Generate and stream publication-grade ReportLab PDF for a complaint."""
    try:
        record = database.get_complaint(ref_or_id)
        if not record:
            return jsonify({"success": False, "error": "Complaint record not found"}), 404

        pdf_bytes = pdf_generator.generate_complaint_pdf(record)
        ref_slug = record.get("reference_id", "CSR").replace("/", "_")
        filename = f"Police_CSR_{ref_slug}.pdf"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        logger.error(f"PDF Export error: {e}", exc_info=True)
        return jsonify({"success": False, "error": f"PDF Generation Error: {str(e)}"}), 500


@app.route("/api/stats", methods=["GET"])
def api_stats():
    """Return dashboard analytics metrics."""
    try:
        stats = database.get_statistics()
        return jsonify({"success": True, "data": stats})
    except Exception as e:
        logger.error(f"Stats error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/system-status", methods=["GET"])
def api_system_status():
    """Return active AI Provider, database state, and station environment info."""
    active_llm = "Offline Rule Engine (Zero Hallucination Guaranteed)"
    if extraction.is_valid_key(extraction.GROQ_API_KEY):
        active_llm = "Groq API (openai/gpt-oss-120b - Fast Zero-Hallucination)"
    elif extraction.is_valid_key(extraction.GEMINI_API_KEY):
        active_llm = "Google Gemini API (gemini-3.8-flash)"

    return jsonify({
        "success": True,
        "station_name": STATION_NAME,
        "district": POLICE_DISTRICT,
        "active_ai_engine": active_llm,
        "database": "SQLite (complaints.db)",
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("DEBUG", "True").lower() in ("true", "1")
    print(f"\n==================================================================")
    print(f" * Police Complaint Documentation System is starting...")
    print(f" * Station: {STATION_NAME}")
    print(f" * Running on http://127.0.0.1:{port}")
    print(f"==================================================================\n")
    app.run(host="127.0.0.1", port=port, debug=debug)
