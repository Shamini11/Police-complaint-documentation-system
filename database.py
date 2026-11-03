"""
database.py - SQLite Database Management for Police Complaint Documentation System
Provides persistent storage, reference ID generation, indexing, CRUD, and analytics.
"""

import sqlite3
import json
import os
from datetime import datetime, timezone

DB_NAME = "complaints.db"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), DB_NAME)


def get_db_connection():
    """Establish and return an optimized SQLite database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrency and foreign keys
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Initialize database tables, indexes, and initial constraints."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference_id TEXT UNIQUE NOT NULL,
                writer_name TEXT NOT NULL,
                writer_id TEXT NOT NULL,
                complainant_name TEXT NOT NULL,
                contact_number TEXT NOT NULL,
                incident_type TEXT DEFAULT 'Not mentioned',
                incident_date TEXT DEFAULT 'Not mentioned',
                incident_time TEXT DEFAULT 'Not mentioned',
                incident_location TEXT DEFAULT 'Not mentioned',
                object_property TEXT DEFAULT 'Not mentioned',
                suspect_person TEXT DEFAULT 'Not mentioned',
                person_description TEXT DEFAULT 'Not mentioned',
                raw_transcript TEXT NOT NULL,
                extracted_entities_json TEXT,
                draft_complaint TEXT NOT NULL,
                complainant_signature TEXT,
                status TEXT DEFAULT 'DRAFT',
                ai_provider_used TEXT DEFAULT 'Rule Engine',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Performance Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ref_id ON complaints(reference_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_complainant_name ON complaints(complainant_name);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contact_number ON complaints(contact_number);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incident_type ON complaints(incident_type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_status ON complaints(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON complaints(created_at);")

        # Dynamic migration for extended complaint fields
        cursor.execute("PRAGMA table_info(complaints);")
        existing_cols = [col[1] for col in cursor.fetchall()]
        if "audio_files_json" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN audio_files_json TEXT;")
        if "conversation_history_json" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN conversation_history_json TEXT;")
        if "father_name" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN father_name TEXT DEFAULT '';")
        if "residential_address" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN residential_address TEXT DEFAULT '';")
        if "govt_id_masked" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN govt_id_masked TEXT DEFAULT '';")
        if "writer_signature" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN writer_signature TEXT DEFAULT '';")
        if "station_seal" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN station_seal TEXT DEFAULT '';")
        if "audio_path" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN audio_path TEXT DEFAULT '';")
        if "audio_filename" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN audio_filename TEXT DEFAULT '';")
        if "audio_duration" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN audio_duration TEXT DEFAULT '';")
        if "vad_stats" not in existing_cols:
            cursor.execute("ALTER TABLE complaints ADD COLUMN vad_stats TEXT DEFAULT '';")

        conn.commit()


def generate_reference_id():
    """
    Generate an authoritative Police Reference ID in the format:
    POL-YYYYMMDD-XXXX (e.g. POL-20261030-0001).
    """
    today_str = datetime.now().strftime("%Y%m%d")
    prefix = f"POL-{today_str}-"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM complaints WHERE reference_id LIKE ?",
            (f"{prefix}%",)
        )
        count = cursor.fetchone()[0] + 1
        ref_id = f"{prefix}{count:04d}"

        # Ensure absolute uniqueness
        cursor.execute("SELECT id FROM complaints WHERE reference_id = ?", (ref_id,))
        if cursor.fetchone():
            import random
            ref_id = f"{prefix}{random.randint(5000, 9999):04d}"

        return ref_id


def save_complaint(data):
    """
    Insert or update a complaint record in SQLite.
    Returns the saved complaint dictionary.
    Supports all standard police documentation field aliases:
      - reference_id / complaint_id
      - writer_name, writer_id
      - complainant_name / name
      - contact_number, father_name, residential_address, govt_id_masked
      - incident_type / incident_category / category
      - draft_complaint / reviewed_draft / english_draft / formal_complaint_draft
      - raw_transcript / transcript / statement / accumulated_transcript
      - status: normalized to 'Draft', 'Saved', or 'Approved'
      - complainant_signature, writer_signature, station_seal
      - single continuous audio metadata (audio_path, audio_filename, audio_duration, vad_stats)
    """
    init_db()

    reference_id = data.get("reference_id") or data.get("complaint_id")
    complaint_id = data.get("id")

    # Complainant Name normalization
    complainant_name = (
        data.get("complainant_name") or
        data.get("name") or
        "Citizen"
    ).strip()

    # Status normalization: "Draft", "Saved", or "Approved"
    raw_status = (data.get("status") or "").strip()
    if raw_status:
        up = raw_status.upper()
        if up in ("DRAFT", "DRAFTS", "PENDING"):
            status = "Draft"
        elif up in ("APPROVED", "FINALIZED"):
            status = "Approved"
        elif up in ("SAVED", "REGISTERED", "REGISTERED_CSR"):
            status = "Saved"
        else:
            status = raw_status
    else:
        status = "Saved"

    # Category normalization
    incident_type = (
        data.get("incident_category") or
        data.get("incident_type") or
        data.get("category") or
        "General"
    ).strip()

    # Draft / statement normalization
    draft_complaint = (
        data.get("reviewed_draft") or
        data.get("draft_complaint") or
        data.get("english_draft") or
        data.get("formal_complaint_draft") or
        ""
    ).strip()

    raw_transcript = (
        data.get("raw_transcript") or
        data.get("transcript") or
        data.get("statement") or
        data.get("accumulated_transcript") or
        draft_complaint
    ).strip()

    # If neither is provided, generate a new reference ID
    is_update = False
    with get_db_connection() as conn:
        cursor = conn.cursor()

        if complaint_id:
            cursor.execute("SELECT reference_id FROM complaints WHERE id = ?", (complaint_id,))
            row = cursor.fetchone()
            if row:
                reference_id = row["reference_id"]
                is_update = True
        elif reference_id:
            cursor.execute("SELECT id FROM complaints WHERE reference_id = ?", (reference_id,))
            row = cursor.fetchone()
            if row:
                complaint_id = row["id"]
                is_update = True

        if not reference_id:
            reference_id = generate_reference_id()

        extracted_json = data.get("extracted_entities_json")
        if isinstance(extracted_json, (dict, list)):
            extracted_json = json.dumps(extracted_json, ensure_ascii=False)

        audio_files_json = data.get("audio_files_json") or data.get("audio_files")
        if isinstance(audio_files_json, (dict, list)):
            audio_files_json = json.dumps(audio_files_json, ensure_ascii=False)

        conv_history_json = data.get("conversation_history_json") or data.get("conversation_history")
        if isinstance(conv_history_json, (dict, list)):
            conv_history_json = json.dumps(conv_history_json, ensure_ascii=False)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        audio_path = data.get("audio_path", "")
        audio_filename = data.get("audio_filename", "")
        audio_duration = data.get("audio_duration", "")
        vad_stats = data.get("vad_stats", "")

        # If audio_files is provided as array, extract from first item if empty
        if isinstance(data.get("audio_files"), list) and len(data.get("audio_files")) > 0:
            first_audio = data.get("audio_files")[0]
            if not audio_filename:
                audio_filename = first_audio.get("filename", "")
            if not audio_path:
                audio_path = first_audio.get("audio_url", "")
            if not audio_duration:
                audio_duration = first_audio.get("duration", "")

        complainant_sig = data.get("complainant_signature", "")
        writer_sig = data.get("writer_signature", "")
        seal = data.get("station_seal", "")

        if is_update:
            cursor.execute("""
                UPDATE complaints SET
                    writer_name = ?,
                    writer_id = ?,
                    complainant_name = ?,
                    contact_number = ?,
                    father_name = CASE WHEN ? != '' THEN ? ELSE father_name END,
                    residential_address = CASE WHEN ? != '' THEN ? ELSE residential_address END,
                    govt_id_masked = CASE WHEN ? != '' THEN ? ELSE govt_id_masked END,
                    incident_type = ?,
                    incident_date = ?,
                    incident_time = ?,
                    incident_location = ?,
                    object_property = ?,
                    suspect_person = ?,
                    person_description = ?,
                    raw_transcript = CASE WHEN ? != '' THEN ? ELSE raw_transcript END,
                    extracted_entities_json = COALESCE(?, extracted_entities_json),
                    draft_complaint = CASE WHEN ? != '' THEN ? ELSE draft_complaint END,
                    complainant_signature = CASE WHEN ? != '' THEN ? ELSE complainant_signature END,
                    writer_signature = CASE WHEN ? != '' THEN ? ELSE writer_signature END,
                    station_seal = CASE WHEN ? != '' THEN ? ELSE station_seal END,
                    status = ?,
                    ai_provider_used = ?,
                    audio_files_json = COALESCE(?, audio_files_json),
                    conversation_history_json = COALESCE(?, conversation_history_json),
                    audio_path = CASE WHEN ? != '' THEN ? ELSE audio_path END,
                    audio_filename = CASE WHEN ? != '' THEN ? ELSE audio_filename END,
                    audio_duration = CASE WHEN ? != '' THEN ? ELSE audio_duration END,
                    vad_stats = CASE WHEN ? != '' THEN ? ELSE vad_stats END,
                    updated_at = ?
                WHERE reference_id = ?
            """, (
                data.get("writer_name", "Duty Officer"),
                data.get("writer_id", "STN-01"),
                complainant_name,
                data.get("contact_number", ""),
                data.get("father_name", ""), data.get("father_name", ""),
                data.get("residential_address", ""), data.get("residential_address", ""),
                data.get("govt_id_masked", ""), data.get("govt_id_masked", ""),
                incident_type,
                data.get("incident_date", "Not mentioned"),
                data.get("incident_time", "Not mentioned"),
                data.get("incident_location", "Not mentioned"),
                data.get("object_property", "Not mentioned"),
                data.get("suspect_person", "Not mentioned"),
                data.get("person_description", "Not mentioned"),
                raw_transcript, raw_transcript,
                extracted_json,
                draft_complaint, draft_complaint,
                complainant_sig, complainant_sig,
                writer_sig, writer_sig,
                seal, seal,
                status,
                data.get("ai_provider_used", "Rule Engine"),
                audio_files_json,
                conv_history_json,
                audio_path, audio_path,
                audio_filename, audio_filename,
                audio_duration, audio_duration,
                vad_stats, vad_stats,
                now_str,
                reference_id
            ))
        else:
            cursor.execute("""
                INSERT INTO complaints (
                    reference_id, writer_name, writer_id, complainant_name, contact_number,
                    father_name, residential_address, govt_id_masked,
                    incident_type, incident_date, incident_time, incident_location,
                    object_property, suspect_person, person_description,
                    raw_transcript, extracted_entities_json, draft_complaint,
                    complainant_signature, writer_signature, station_seal,
                    status, ai_provider_used,
                    audio_files_json, conversation_history_json,
                    audio_path, audio_filename, audio_duration, vad_stats,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                reference_id,
                data.get("writer_name", "Duty Officer"),
                data.get("writer_id", "STN-01"),
                complainant_name,
                data.get("contact_number", ""),
                data.get("father_name", ""),
                data.get("residential_address", ""),
                data.get("govt_id_masked", ""),
                incident_type,
                data.get("incident_date", "Not mentioned"),
                data.get("incident_time", "Not mentioned"),
                data.get("incident_location", "Not mentioned"),
                data.get("object_property", "Not mentioned"),
                data.get("suspect_person", "Not mentioned"),
                data.get("person_description", "Not mentioned"),
                raw_transcript,
                extracted_json,
                draft_complaint,
                complainant_sig,
                writer_sig,
                seal,
                status,
                data.get("ai_provider_used", "Rule Engine"),
                audio_files_json or "[]",
                conv_history_json or "[]",
                audio_path,
                audio_filename,
                audio_duration,
                vad_stats,
                now_str,
                now_str
            ))

        conn.commit()

    return get_complaint(reference_id)


def get_complaint(ref_or_id):
    """Retrieve a single complaint record by numeric ID or Reference ID string."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if str(ref_or_id).isdigit():
            cursor.execute("SELECT * FROM complaints WHERE id = ?", (int(ref_or_id),))
        else:
            cursor.execute("SELECT * FROM complaints WHERE reference_id = ?", (str(ref_or_id),))

        row = cursor.fetchone()
        if not row:
            return None

        record = dict(row)
        if record.get("extracted_entities_json"):
            try:
                record["extracted_entities"] = json.loads(record["extracted_entities_json"])
            except Exception:
                record["extracted_entities"] = {}
        else:
            record["extracted_entities"] = {}

        if record.get("audio_files_json"):
            try:
                record["audio_files"] = json.loads(record["audio_files_json"])
            except Exception:
                record["audio_files"] = []
        else:
            record["audio_files"] = []

        # If single continuous audio file is recorded in dedicated column, ensure synchronized exposure
        if record.get("audio_filename") and len(record["audio_files"]) == 0:
            record["audio_files"] = [{
                "filename": record["audio_filename"],
                "audio_url": record.get("audio_path") or f"/static/uploads/audio/{record['audio_filename']}",
                "duration": record.get("audio_duration", "N/A"),
                "vad_stats": record.get("vad_stats", "Smart Auto-Pause VAD Active"),
                "timestamp": record.get("created_at", "")
            }]
        elif len(record["audio_files"]) > 0 and not record.get("audio_filename"):
            record["audio_filename"] = record["audio_files"][0].get("filename", "")
            record["audio_path"] = record["audio_files"][0].get("audio_url", "")
            record["audio_duration"] = record["audio_files"][0].get("duration", "")

        if record.get("conversation_history_json"):
            try:
                record["conversation_history"] = json.loads(record["conversation_history_json"])
            except Exception:
                record["conversation_history"] = []
        else:
            record["conversation_history"] = []

        return record


def search_complaints(query=None, status=None, category=None, limit=100, offset=0):
    """
    Search and filter complaints across reference ID, complainant name,
    contact number, incident category, location, and station writer.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        conditions = []
        params = []

        if query and query.strip():
            clean_q = f"%{query.strip()}%"
            conditions.append("""(
                reference_id LIKE ? OR
                complainant_name LIKE ? OR
                father_name LIKE ? OR
                govt_id_masked LIKE ? OR
                contact_number LIKE ? OR
                incident_type LIKE ? OR
                incident_location LIKE ? OR
                object_property LIKE ? OR
                writer_name LIKE ? OR
                writer_id LIKE ? OR
                status LIKE ?
            )""")
            params.extend([clean_q] * 11)

        if category and category.strip() and category.upper() != "ALL":
            clean_cat = f"%{category.strip()}%"
            conditions.append("incident_type LIKE ?")
            params.append(clean_cat)

        if status and status.strip() and status.upper() != "ALL":
            st = status.strip().upper()
            if st in ("DRAFT", "DRAFTS", "PENDING"):
                conditions.append("UPPER(status) IN ('DRAFT', 'DRAFTS', 'PENDING')")
            elif st in ("SAVED", "REGISTERED", "REGISTERED_CSR"):
                conditions.append("UPPER(status) IN ('SAVED', 'REGISTERED', 'REGISTERED_CSR')")
            elif st in ("APPROVED", "FINALIZED"):
                conditions.append("UPPER(status) IN ('APPROVED', 'FINALIZED')")
            else:
                conditions.append("UPPER(status) = ?")
                params.append(st)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        sql = f"""
            SELECT id, reference_id, writer_name, writer_id, complainant_name,
                   father_name, residential_address, govt_id_masked,
                   contact_number, incident_type, incident_date, incident_time,
                   incident_location, object_property, draft_complaint, raw_transcript,
                   status, ai_provider_used, audio_filename, audio_duration,
                   created_at, updated_at
            FROM complaints
            {where_clause}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def delete_complaint(ref_or_id):
    """Delete a complaint record by ID or Reference ID."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if str(ref_or_id).isdigit():
            cursor.execute("DELETE FROM complaints WHERE id = ?", (int(ref_or_id),))
        else:
            cursor.execute("DELETE FROM complaints WHERE reference_id = ?", (str(ref_or_id),))
        conn.commit()
        return cursor.rowcount > 0


def update_status(ref_or_id, new_status):
    """Update status (e.g. Draft, Saved, Approved) for a record."""
    init_db()
    raw_status = (new_status or "Saved").strip()
    up = raw_status.upper()
    if up in ("DRAFT", "DRAFTS", "PENDING"):
        normalized = "Draft"
    elif up in ("APPROVED", "FINALIZED"):
        normalized = "Approved"
    elif up in ("SAVED", "REGISTERED", "REGISTERED_CSR"):
        normalized = "Saved"
    else:
        normalized = raw_status

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if str(ref_or_id).isdigit():
            cursor.execute(
                "UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?",
                (normalized, now_str, int(ref_or_id))
            )
        else:
            cursor.execute(
                "UPDATE complaints SET status = ?, updated_at = ? WHERE reference_id = ?",
                (normalized, now_str, str(ref_or_id))
            )
        conn.commit()
        return cursor.rowcount > 0


def get_statistics():
    """Return dashboard KPI metrics."""
    init_db()
    today_str = datetime.now().strftime("%Y-%m-%d")

    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM complaints")
        total_complaints = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM complaints WHERE date(created_at) = date(?)", (today_str,))
        today_complaints = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM complaints WHERE UPPER(status) IN ('DRAFT', 'DRAFTS', 'PENDING')")
        pending_drafts = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM complaints WHERE UPPER(status) IN ('SAVED', 'REGISTERED', 'REGISTERED_CSR')")
        total_saved = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM complaints WHERE UPPER(status) IN ('APPROVED', 'FINALIZED')")
        total_approved = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM complaints WHERE UPPER(status) IN ('REGISTERED_CSR', 'APPROVED', 'SAVED', 'FINALIZED')")
        registered_approved = cursor.fetchone()[0]

        cursor.execute("""
            SELECT incident_type, COUNT(*) as count
            FROM complaints
            GROUP BY incident_type
            ORDER BY count DESC
            LIMIT 8
        """)
        breakdown = [dict(r) for r in cursor.fetchall()]

        return {
            "total_complaints": total_complaints,
            "today_complaints": today_complaints,
            "pending_drafts": pending_drafts,
            "total_saved": total_saved,
            "total_approved": total_approved,
            "registered_approved": registered_approved,
            "incident_breakdown": breakdown
        }


# Auto-initialize table schema when imported
init_db()
