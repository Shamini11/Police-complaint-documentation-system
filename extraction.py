"""
extraction.py - Dual-LLM & Rule Engine for Zero-Hallucination Information Extraction
Supports Google Gemini API, Groq API, and an offline rule/regex engine with Tamil/Tanglish/English support.
"""

import os
import re
import json
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Initialize API Keys from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

def is_valid_key(key):
    return bool(key and not key.startswith("your_") and len(key) > 15)

def clean_unicode_text(text):
    """Normalize special Unicode characters to clean ASCII/Latin compatible text."""
    if not text:
        return ""
    s = str(text)
    s = s.replace('\u202f', ' ').replace('\u00a0', ' ').replace('\u200b', '')
    s = s.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '--')
    s = s.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
    s = s.replace('\u2022', '*').replace('\u25cf', '*').replace('\U0001f4cc', '[NOTE]').replace('\U0001f50d', '[SEARCH]')
    return s

STRICT_EXTRACTION_SYSTEM_PROMPT = """You are a highly experienced Indian Police Station AI Writer Assistant attached to the Law & Order and Crime Records Bureau.
Your primary role is to extract factual details from oral/written statements submitted by citizens in Tamil, English, or Tanglish (Tamil written in Latin script).

ZERO HALLUCINATION DIRECTIVE:
1. Extract ONLY facts that are EXPLICITLY mentioned in the provided citizen transcript.
2. Under NO circumstances should you invent, infer, extrapolate, or assume any detail.
3. If any field or detail was NOT explicitly stated by the complainant, you MUST set its value strictly to: "Not mentioned".
4. Do NOT hallucinate suspect identities, vehicle registration numbers, brands, jewelry weight, currency amounts, or locations that are not stated.
5. Identify the precise Case Type (e.g., Theft, Lost Property, Assault, Chain Snatching, Cyber Financial Fraud, Threat, Road Traffic Accident, Property Dispute, Harassment).
6. Recommend 3 to 5 applicable legal and procedural sections tailored specifically to this incident (e.g. BNS 303(2)/IPC 379, BNS 304, BNS 115(2), IT Act 66D, CEIR Portal Requisition, Sec 105 BNSS Seizure Mahazar, Sec 51 BNSS Medical Requisition).
7. Provide conversational Station Writer Guidance explaining the classification, relevant statutory section (BNS 2023 / IPC), and instructions on follow-up questions to ask the complainant.
8. Identify genuine missing legal details that a Police Station Writer needs to ask the complainant to register a complete Community Service Register (CSR) or First Information Report (FIR).
9. Format a structured, professional English formal police complaint draft in standard Indian Police CSR / FIR format.

You must respond ONLY with a valid, parseable JSON object adhering strictly to this schema:
{
  "case_type": "string (e.g., Theft, Lost Property, Assault, Chain Snatching, Cyber Financial Fraud, Threat, Road Traffic Accident, Property Dispute, Harassment)",
  "incident_type": "string (same as case_type)",
  "date": "string (exact date/day mentioned or Not mentioned)",
  "time": "string (exact time or period mentioned or Not mentioned)",
  "location": "string (exact place or landmark mentioned or Not mentioned)",
  "object_property": "string (exact object/property involved or Not mentioned)",
  "suspect_person": "string (name or suspect mention or Not mentioned)",
  "person_description": "string (physical features, attire, vehicle of suspect or Not mentioned)",
  "synopsis": "string (objective 1-2 sentence factual summary strictly using mentioned facts)",
  "agent_guidance": "string (conversational advisory message addressed to the Station Writer)",
  "recommended_sections": [
    {
      "section_code": "string (e.g. BNS 303(2) / IPC 379)",
      "title": "string (descriptive short title)",
      "category": "string (e.g. Substantive Law, Procedural Requisition, Evidence / Forensics)",
      "description": "string (concise 1-line legal/procedural justification)",
      "template_text": "string (formal legal/procedural text block ready to insert into the complaint draft)"
    }
  ],
  "missing_critical_info": [
    {
      "field": "string (name of missing attribute)",
      "question": "string (precise question for the Station Writer to ask the complainant)"
    }
  ],
  "formal_complaint_draft": "string (clean, formal English legal complaint draft ready for Police Station Writer review)"
}
"""

COPILOT_SYSTEM_PROMPT = """You are an expert Indian Police Legal & Procedural Co-Pilot for Station Writers.
You assist the duty officer / station writer in:
1. Identifying applicable sections of Bharatiya Nyaya Sanhita (BNS) 2023 and old Indian Penal Code (IPC) equivalents.
2. Assessing whether the complaint discloses a cognizable offence (requiring FIR under Section 173 BNSS) or a non-cognizable incident (requiring CSR / General Diary entry).
3. Recommending essential investigative elements (e.g., CCTV collection, IMEI tracking on CEIR portal, CDR analysis, seizure memo requirements, medical examination under Section 51 BNSS).
4. Providing concise, legally precise, non-hallucinatory guidance in professional police terminology.
Keep answers structured with bullet points.
"""


def extract_with_gemini(transcript, station_writer_name="Duty Officer", complainant_name="Citizen", contact_number="", father_name="", residential_address="", govt_id_masked=""):
    """Extract entities using Google GenAI SDK (gemini-2.5-flash) with temperature 0.0."""
    if not is_valid_key(GEMINI_API_KEY):
        raise ValueError("Valid GEMINI_API_KEY is not configured.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY, http_options=types.HttpOptions(timeout=3000))

    user_content = f"""
STATION WRITER: {station_writer_name}
COMPLAINANT NAME: {complainant_name}
FATHER / SPOUSE: {father_name}
CONTACT: {contact_number}
ADDRESS: {residential_address}

STATEMENT TRANSCRIPT (TAMIL / TANGLISH / ENGLISH):
\"\"\"{transcript}\"\"\"

Extract the factual entities into the requested JSON schema. Enforce 0% hallucination.
"""

    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=STRICT_EXTRACTION_SYSTEM_PROMPT,
            temperature=0.0,
            response_mime_type="application/json"
        )
    )

    raw_text = response.text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]

    parsed = json.loads(raw_text.strip())
    parsed["ai_provider"] = "Google Gemini (gemini-2.5-flash)"
    sanitize_extracted_dict(parsed, transcript, station_writer_name, complainant_name, contact_number, father_name, residential_address, govt_id_masked)
    return parsed


def extract_with_groq(transcript, station_writer_name="Duty Officer", complainant_name="Citizen", contact_number="", father_name="", residential_address="", govt_id_masked=""):
    """Extract entities using Groq API (openai/gpt-oss-120b / llama-3.3-70b-versatile) with temperature 0.0."""
    if not is_valid_key(GROQ_API_KEY):
        raise ValueError("Valid GROQ_API_KEY is not configured.")

    from groq import Groq

    client = Groq(api_key=GROQ_API_KEY, timeout=5.0)

    user_prompt = f"""
STATION WRITER: {station_writer_name}
COMPLAINANT: {complainant_name}
FATHER / SPOUSE: {father_name}
CONTACT: {contact_number}
ADDRESS: {residential_address}

STATEMENT TRANSCRIPT:
\"\"\"{transcript}\"\"\"

Extract the factual entities into the specified JSON schema strictly without hallucinations.
"""

    groq_models = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"]
    last_err = None

    for model_name in groq_models:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": STRICT_EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )

            raw_content = completion.choices[0].message.content.strip()
            parsed = json.loads(raw_content)
            parsed["ai_provider"] = f"Groq ({model_name})"
            sanitize_extracted_dict(parsed, transcript, station_writer_name, complainant_name, contact_number, father_name, residential_address, govt_id_masked)
            return parsed
        except Exception as e:
            last_err = e
            logger.info(f"Groq model {model_name} attempt: {e}")

    raise last_err or Exception("All Groq models failed")


def generate_recommended_sections(case_type="Incident / General Complaint", transcript="", object_property="", suspect_person=""):
    """
    Generate authoritative Indian Police statutory & procedural recommended legal sections
    tailored to the specific incident type and occurrence parameters.
    Covers BNS 2023, BNSS 2023, IT Act 2000, CEIR Portal, and relevant criminal procedures.
    """
    c_lower = (case_type or "").lower()
    t_lower = (transcript or "").lower()
    p_lower = (object_property or "").lower()
    sections = []

    # 1. Theft / Stolen Property
    if any(k in c_lower for k in ["theft", "stolen", "thiruttu", "burglary", "pickpocket"]):
        sections.append({
            "section_code": "BNS 303(2) / IPC 379",
            "title": "Theft Offence Classification",
            "category": "Substantive Law",
            "description": "Statutory penal provision for dishonest removal of movable property without consent.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 303(2) / IPC SECTION 379 — THEFT]\nThe statement and factual circumstances disclosed prima facie make out an offence of Theft punishable under Section 303(2) of the Bharatiya Nyaya Sanhita, 2023 (corresponding to Section 379 of the Indian Penal Code). The accused moved movable property dishonestly out of the lawful possession of the complainant without consent."
        })
        if any(k in t_lower or k in p_lower for k in ["phone", "mobile", "cell", "iphone", "samsung", "redmi", "vivo", "oppo", "smartphone", "sim"]):
            sections.append({
                "section_code": "CEIR IMEI Requisition",
                "title": "CEIR IMEI Blacklisting & Tower Alerts",
                "category": "Cyber & Electronics Trace",
                "description": "Instant IMEI blocking across all Indian telecom networks with automated police tower alerts.",
                "template_text": "\n\n[PROCEDURAL REQUISITION: CEIR IMEI BLACKLISTING & TOWER TRACE]\nRequisition is initiated on the Central Equipment Identity Register (CEIR) under Department of Telecommunications guidelines to blacklist the 15-digit IMEI-1 & IMEI-2 numbers of the stolen mobile device, block unauthorized network access across all TSP networks, and generate automated real-time tower alerts upon active SIM insertion."
            })
        sections.append({
            "section_code": "Sec 105 BNSS",
            "title": "Seizure Mahazar & Search Protocol",
            "category": "Procedural Requisition",
            "description": "Mandatory contemporary audio-video recorded seizure and independent witness panchnama.",
            "template_text": "\n\n[PROCEDURAL CLAUSE: SECTION 105 BNSS SEIZURE MAHAZAR PROTOCOL]\nIn strict compliance with Section 105 of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023, search and seizure of stolen property, vehicle, or evidentiary items shall be conducted with contemporaneous audio-video electronic recording and attested by two independent spot witnesses."
        })
        sections.append({
            "section_code": "Sec 94 BNSS",
            "title": "CCTV Footage Preservation",
            "category": "Evidentiary Directive",
            "description": "Notice to secure and preserve local CCTV camera digital DVR footage around the scene.",
            "template_text": "\n\n[EVIDENTIARY DIRECTIVE: SECTION 94 BNSS CCTV FOOTAGE PRESERVATION]\nNotice issued under Section 94 BNSS to commercial establishments and municipal authorities covering the Scene of Crime and escape corridors to safeguard and furnish raw digital DVR recordings for suspect identification."
        })

    # 2. Snatching / Robbery
    elif any(k in c_lower for k in ["snatch", "snatching", "robbery", "paripu", "பறிப்பு"]):
        sections.append({
            "section_code": "BNS 304 / IPC 392",
            "title": "Robbery & Snatching Classification",
            "category": "Substantive Law",
            "description": "Cognizable offence of dispossessing property by sudden criminal force or threat.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 304 / IPC SECTION 392 — ROBBERY & SNATCHING]\nThe acts disclosed prima facie constitute the cognizable offence of Snatching / Robbery punishable under Section 304 of Bharatiya Nyaya Sanhita, 2023 (corresponding to Section 392 IPC). The perpetrator employed sudden criminal physical force in a public pathway to dispossess the complainant of property."
        })
        sections.append({
            "section_code": "Sec 105 BNSS",
            "title": "Audio-Visual Seizure Memo",
            "category": "Procedural Requisition",
            "description": "Electronic recording of recovered gold ornament / vehicle and panchnama.",
            "template_text": "\n\n[PROCEDURAL PROTOCOL: SECTION 105 BNSS SEIZURE MAHAZAR]\nRecovery of snatched gold ornaments, offending two-wheeler, or weapons shall strictly adhere to Section 105 BNSS requiring mandatory contemporaneous audio-video electronic recording and independent witness Mahazar."
        })
        sections.append({
            "section_code": "City Patrol Interception",
            "title": "Control Room Wireless Interception Alert",
            "category": "Tactical Operation",
            "description": "Immediate VHF transmission to check-posts and flying patrol squads.",
            "template_text": "\n\n[TACTICAL OPERATION: WIRELESS VEHICLE INTERCEPTION DIRECTIVE]\nImmediate wireless flash message transmitted across City Police VHF networks with description of suspects and getaway two-wheeler for vehicle stop-and-search operations at perimeter check-posts."
        })

    # 3. Physical Assault / Hurt / Threat
    elif any(k in c_lower for k in ["assault", "hurt", "attack", "beaten", "violence", "threat", "intimidation"]):
        sections.append({
            "section_code": "BNS 115(2) / IPC 323",
            "title": "Voluntarily Causing Hurt",
            "category": "Substantive Law",
            "description": "Causing bodily pain or injury voluntarily to complainant.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 115(2) / IPC SECTION 323 — VOLUNTARILY CAUSING HURT]\nThe statement discloses that the accused person(s) voluntarily caused bodily hurt and physical injury to the complainant, punishable under Section 115(2) of Bharatiya Nyaya Sanhita, 2023 (corresponding to Section 323 IPC)."
        })
        sections.append({
            "section_code": "BNS 351(2) / IPC 506",
            "title": "Criminal Intimidation",
            "category": "Substantive Law",
            "description": "Communicating explicit verbal threats to cause injury to person or reputation.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 351(2) / IPC SECTION 506 — CRIMINAL INTIMIDATION]\nThe accused communicated explicit verbal threats of bodily injury and injury to person/property, constituting Criminal Intimidation punishable under Section 351(2) of Bharatiya Nyaya Sanhita, 2023 (corresponding to Section 506 IPC)."
        })
        sections.append({
            "section_code": "Sec 51 BNSS",
            "title": "Medical Requisition & Wound Certificate",
            "category": "Medico-Legal Procedure",
            "description": "Statutory hospital referral of injured victim for Accident Register (AR) documentation.",
            "template_text": "\n\n[STATUTORY REQUISITION: SECTION 51 BNSS MEDICO-LEGAL EXAMINATION]\nOfficial Police Medical Memo issued referring the injured complainant to the Government Headquarters Hospital for emergency medical treatment, medico-legal clinical examination, and issuance of Accident Register (AR) / Wound Certificate under Section 51 of BNSS, 2023."
        })

    # 4. Cheating / Cyber Financial Fraud
    elif any(k in c_lower for k in ["cyber", "fraud", "cheating", "financial", "otp", "bank", "scam"]):
        sections.append({
            "section_code": "IT Act Sec 66D",
            "title": "Cheating by Personation via Computer Resource",
            "category": "Cyber Law",
            "description": "Deception, impersonation, and fraudulent fund siphoning using electronic devices.",
            "template_text": "\n\n[STATUTORY CLAUSE: INFORMATION TECHNOLOGY ACT SECTION 66D]\nThe acts disclose dishonest impersonation and fraudulent inducement through computer and telecommunication resources, punishable under Section 66D of the Information Technology Act, 2000."
        })
        sections.append({
            "section_code": "BNS 318(4) / IPC 420",
            "title": "Cheating & Dishonestly Inducing Delivery of Property",
            "category": "Substantive Law",
            "description": "Dishonest inducement causing pecuniary wrongful loss to complainant.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 318(4) / IPC SECTION 420 — CHEATING]\nThe accused dishonestly deceived the complainant into transferring pecuniary funds, constituting an offence under Section 318(4) of Bharatiya Nyaya Sanhita, 2023 (corresponding to Section 420 IPC)."
        })
        sections.append({
            "section_code": "1930 / CFCFRMS",
            "title": "Cyber Helpline 1930 & Bank Lien Requisition",
            "category": "Financial Recovery",
            "description": "Immediate intimation to beneficiary banks for debit freeze within Golden Hour.",
            "template_text": "\n\n[PROCEDURAL REQUISITION: CFCFRMS PORTAL / BANK LIEN INTIMATION]\nImmediate formal intimation dispatched via Citizen Financial Cyber Fraud Reporting & Management System (CFCFRMS / Helpline 1930) to beneficiary banking institutions to place an immediate debit freeze and lien on recipient accounts matching transaction UTR details."
        })

    # 5. Missing / Lost Property
    elif any(k in c_lower for k in ["lost", "missing", "misplaced", "disappeared", "kanala", "tholanji"]):
        sections.append({
            "section_code": "CSR / GD Entry",
            "title": "Non-Cognizable Lost Property Register",
            "category": "Station Procedure",
            "description": "Community Service Register documentation for misplaced property without criminal foul play.",
            "template_text": "\n\n[POLICE PROCEDURE: NON-COGNIZABLE CSR LOST PROPERTY ENTRY]\nThe article/property has been reported misplaced/lost without allegations of criminal force. Recorded in the station Community Service Register (CSR) for preliminary verification, public notice, and issuance of Non-Traceable Certificate if untraced."
        })
        if any(k in t_lower or k in p_lower for k in ["phone", "mobile", "cell", "iphone", "samsung", "device", "sim"]):
            sections.append({
                "section_code": "CEIR Portal Requisition",
                "title": "CEIR Missing Smartphone Blocking",
                "category": "Cyber & Device Trace",
                "description": "IMEI registration on CEIR portal to prevent SIM misuse and obtain location ping.",
                "template_text": "\n\n[TECHNICAL ACTION: CEIR LOST SMARTPHONE PORTAL SUBMISSION]\nParticulars of the misplaced device registered on the CEIR portal under Lost/Missing category to block unauthorized network activation and alert the station upon tower presence."
            })

    # 6. Road Traffic Accident
    elif any(k in c_lower for k in ["accident", "collision", "crash", "hit and run", "vehicle"]):
        sections.append({
            "section_code": "BNS 281 & 125(a)",
            "title": "Rash Driving on Public Way & Causing Hurt",
            "category": "Substantive Law",
            "description": "Driving in a rash or negligent manner endangering human safety.",
            "template_text": "\n\n[STATUTORY CLAUSE: BNS SECTION 281 & 125(a) / IPC SECTION 279 & 337]\nThe offending vehicle was operated on a public highway in a rash or negligent manner endangering human life and safety, causing hurt to the complainant, punishable under Sections 281 and 125(a) of Bharatiya Nyaya Sanhita, 2023."
        })
        sections.append({
            "section_code": "MVI Inspection",
            "title": "Motor Vehicle Inspection Requisition",
            "category": "Technical Inspection",
            "description": "Requisition to RTO / MVI for mechanical examination of accident vehicles.",
            "template_text": "\n\n[PROCEDURAL REQUISITION: MOTOR VEHICLE INSPECTION (MVI) EXAMINATION]\nFormal requisition forwarded to the Regional Transport Officer / Motor Vehicle Inspector to conduct mechanical examination of the involved vehicle(s) to verify brake integrity, steering mechanism, and impact damage under the Motor Vehicles Act."
        })

    # Universal supplementary sections ensuring at least 3 cards
    if len(sections) < 3:
        sections.append({
            "section_code": "Sec 173(3) BNSS",
            "title": "Preliminary Enquiry Statutory Clause",
            "category": "Legal Procedure",
            "description": "Statutory 14-day inquiry window under Section 173(3) BNSS to ascertain cognizable offence.",
            "template_text": "\n\n[STATUTORY CLAUSE: SECTION 173(3) BNSS PRELIMINARY ENQUIRY]\nIn terms of Section 173(3) of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023, preliminary enquiry is initiated by the Station Writer / Duty Officer within the statutory 14-day window to ascertain whether a cognizable offence is prima facie disclosed."
        })
    if len(sections) < 3:
        sections.append({
            "section_code": "Sec 94 BNSS",
            "title": "Notice to Produce Documents / Evidence",
            "category": "Investigation Procedure",
            "description": "Formal notice to produce purchase bills, ownership proof, or documents.",
            "template_text": "\n\n[PROCEDURAL REQUISITION: SECTION 94 BNSS SUMMONS TO PRODUCE DOCUMENT]\nNotice under Section 94 BNSS issued requesting the production of relevant purchase invoices, ownership records, identity proofs, or digital records necessary for inquiry."
        })

    return sections


def sanitize_extracted_dict(parsed, transcript, station_writer_name="Duty Officer", complainant_name="Citizen", contact_number="", father_name="", residential_address="", govt_id_masked=""):
    """Ensure all required factual fields exist and default to 'Not mentioned' if null/empty."""
    fields = [
        "incident_type", "date", "time", "location", "object_property",
        "suspect_person", "person_description", "synopsis"
    ]
    for f in fields:
        if not parsed.get(f) or str(parsed.get(f)).lower() in ["none", "null"]:
            parsed[f] = "Not mentioned"

    # Synchronize case_type and incident_type
    case_type = parsed.get("case_type") or parsed.get("incident_type")
    if not case_type or str(case_type).lower() in ["none", "null"]:
        case_type = "Incident / General Complaint"
    parsed["case_type"] = case_type
    parsed["incident_type"] = case_type

    if not parsed.get("missing_critical_info") or not isinstance(parsed.get("missing_critical_info"), list):
        parsed["missing_critical_info"] = []

    # Validate or generate dynamic recommended sections
    raw_sections = parsed.get("recommended_sections")
    valid_sections = []
    if isinstance(raw_sections, list):
        for s in raw_sections:
            if isinstance(s, dict) and s.get("section_code") and (s.get("template_text") or s.get("title")):
                valid_sections.append({
                    "section_code": clean_unicode_text(s.get("section_code", "")),
                    "title": clean_unicode_text(s.get("title", s.get("section_code", ""))),
                    "category": clean_unicode_text(s.get("category", "Statutory Provision")),
                    "description": clean_unicode_text(s.get("description", "")),
                    "template_text": clean_unicode_text(s.get("template_text", f"\n\n[{s.get('section_code', '')}]\n{s.get('description', '')}"))
                })
    if not valid_sections:
        valid_sections = generate_recommended_sections(
            case_type=case_type,
            transcript=transcript,
            object_property=parsed.get("object_property", ""),
            suspect_person=parsed.get("suspect_person", "")
        )
    parsed["recommended_sections"] = valid_sections

    # Auto-generate Smart Writer Guidance if LLM didn't provide it
    if not parsed.get("agent_guidance") or str(parsed.get("agent_guidance")).lower() in ["none", "null", "not mentioned"]:
        missing_count = len(parsed["missing_critical_info"])
        guidance = f"Officer, based on the citizen's statement, this case is identified as **{case_type.upper()}**.\n"
        if "Theft" in case_type:
            guidance += "• Applicable Law: **Section 303(2) Bharatiya Nyaya Sanhita (BNS)** / Section 379 IPC.\n"
        elif "Snatch" in case_type:
            guidance += "• Applicable Law: **Section 304 BNS** (Robbery / Snatching - Cognizable offence).\n"
        elif "Assault" in case_type:
            guidance += "• Applicable Law: **Section 115(2) BNS** (Voluntarily Causing Hurt) / Section 323 IPC.\n"
        elif "Lost" in case_type or "Missing" in case_type:
            guidance += "• Classification: **Non-Cognizable Lost Property Report** (CSR Entry / CEIR).\n"
        elif "Cyber" in case_type or "Fraud" in case_type:
            guidance += "• Applicable Law: **Section 318(4) BNS & Section 66D IT Act 2000**.\n"

        if missing_count > 0:
            guidance += f"• Follow-up Required: Identified **{missing_count} missing critical details**. Click any prompt chip below to question the complainant."
        else:
            guidance += "• Verification: Essential occurrence parameters captured. Review the formal draft on the right pane."
        parsed["agent_guidance"] = guidance

    if not parsed.get("formal_complaint_draft"):
        # Auto-generate draft if LLM omitted it
        today_formatted = datetime.now().strftime("%d-%m-%Y")
        now_time = datetime.now().strftime("%H:%M hrs")
        parsed["formal_complaint_draft"] = f"""BEFORE THE STATION HOUSE OFFICER / DUTY OFFICER
CRIME & COMMUNITY SERVICE REGISTER (CSR) DIVISION

SUB: INTIMATION OF COMPLAINT REGARDING {parsed.get('incident_type', 'INCIDENT').upper()} - REGARDING.

1. COMPLAINANT IDENTIFICATION:
   Name of Complainant : {complainant_name}
   Father / Spouse     : {father_name or 'Not stated'}
   Contact Telephone   : {contact_number or 'Not provided'}
   Residential Address : {residential_address or 'Not stated'}
   Government ID       : {govt_id_masked or 'Not provided / Verified'}
   Recording Writer    : {station_writer_name}
   Intake Date & Time  : {today_formatted} at {now_time}

2. PARTICULARS OF OCCURRENCE:
   (a) Category of Offence : {parsed.get('incident_type')}
   (b) Date of Occurrence  : {parsed.get('date')}
   (c) Time of Occurrence  : {parsed.get('time')}
   (d) Scene of Occurrence : {parsed.get('location')}

3. PROPERTY / OBJECT PARTICULARS:
   Description : {parsed.get('object_property')}

4. SUSPECT / ACCUSED:
   Description : {parsed.get('suspect_person')} ({parsed.get('person_description')})

5. COMPLAINANT STATEMENT:
   "{transcript.strip()}"

6. PRAYER:
   {parsed.get('synopsis')}
   WHEREFORE, it is humbly prayed that appropriate lawful action be initiated under applicable police regulations.
"""


def extract_with_rules(transcript, station_writer_name="Duty Officer", complainant_name="Citizen", contact_number="", father_name="", residential_address="", govt_id_masked=""):
    """
    Offline Comprehensive Rule & Regex Engine for Police Complaint Processing.
    Supports Tamil script, Tanglish (Romanized Tamil), and English.
    Guarantees 0% hallucination by only extracting pattern-matched factual evidence.
    """
    lower = transcript.lower()

    # 1. Incident Type Classification
    incident_type = "Not mentioned"
    if any(k in lower for k in [
        "பறிப்பு", "செயின் பறிப்பு", "snatched", "snatching", "snatch", "பறித்து", "பறித்தார்"
    ]):
        incident_type = "Chain / Property Snatching"
    elif any(k in lower for k in [
        "திருடு", "திருட்டு", "திருடப்பட்டது", "திருடி", "திருட", "thiruttu", "thiruditaanga",
        "thirudina", "stolen", "theft", "thief", "steal", "stole", "stealing", "robbed", "robbery",
        "burglar", "burglary", "pickpocket"
    ]):
        incident_type = "Theft"
    elif any(k in lower for k in [
        "காணாமல்", "காணவில்லை", "தொலைந்து", "தொலைந்தது", "kanala", "tholanji", "lost",
        "missing", "misplaced", "disappeared"
    ]):
        incident_type = "Missing / Lost Property"
    elif any(k in lower for k in [
        "அடித்த", "தாக்க", "தாக்குதல்", "அடிச்சு", "assault", "attack", "beaten", "hit", "physical violence"
    ]):
        incident_type = "Physical Assault / Hurt"
    elif any(k in lower for k in [
        "மிரட்ட", "மிரட்டல்", "மிரட்டினார்", "threat", "threatening", "threatened", "blackmail", "intimidation"
    ]):
        incident_type = "Criminal Threat & Intimidation"
    elif any(k in lower for k in [
        "விபத்து", "மோதி", "மோதியது", "accident", "hit and run", "collision", "crash"
    ]):
        incident_type = "Road Traffic Accident"
    elif any(k in lower for k in [
        "ஏமாற்றி", "பணம் ஏமாற்ற", "மோசடி", "otp", "cyber", "online fraud", "scam", "cheated", "fraud"
    ]):
        incident_type = "Cheating / Cyber Financial Fraud"

    # 2. Object / Property Details
    object_property = "Not mentioned"
    detected_objects = []

    # Mobile Phones & Electronics Brands in English & Tamil
    if any(k in lower for k in [
        "அலைபேசி", "கைபேசி", "செல்போன்", "மொபைல்", "போன்", "phone", "mobile", "smartphone",
        "சாம்சங்", "ஆப்பிள்", "ஐபோன்", "ரெட்மி", "விவோ", "ஒப்போ", "ஒன்பிளஸ்"
    ]):
        phone_brand = ""
        if "சாம்சங்" in lower or "samsung" in lower:
            phone_brand = "Samsung"
        elif "ஆப்பிள்" in lower or "ஐபோன்" in lower or "iphone" in lower or "apple" in lower:
            phone_brand = "Apple iPhone"
        elif "ரெட்மி" in lower or "redmi" in lower or "xiaomi" in lower:
            phone_brand = "Redmi / Xiaomi"
        elif "விவோ" in lower or "vivo" in lower:
            phone_brand = "Vivo"
        elif "ஒப்போ" in lower or "oppo" in lower:
            phone_brand = "Oppo"
        elif "ரியல்மி" in lower or "realme" in lower:
            phone_brand = "Realme"
        elif "ஒன்பிளஸ்" in lower or "oneplus" in lower:
            phone_brand = "OnePlus"
        
        phone_match = re.search(r'\b(iphone|samsung|redmi|realme|vivo|oppo|oneplus|poco|motorola|nokia|xiaomi)(?:\s+[a-zA-Z0-9]+){0,3}\b', lower)
        if phone_match:
            detected_objects.append(f"Mobile phone ({phone_match.group(0).strip().title()})")
        elif phone_brand:
            detected_objects.append(f"Mobile phone ({phone_brand})")
        else:
            detected_objects.append("Mobile phone")

    # Laptops / Electronics
    if any(k in lower for k in ["மடிக்கணினி", "லேப்டாப்", "laptop", "macbook", "computer", "ipad", "tablet"]):
        laptop_match = re.search(r'\b(dell|hp|lenovo|asus|acer|apple|macbook)(?:\s+[a-zA-Z0-9]+){0,3}\b', lower)
        if laptop_match:
            detected_objects.append(f"Laptop ({laptop_match.group(0).strip().title()})")
        else:
            detected_objects.append("Laptop computer")

    # Vehicles / Two Wheelers
    if any(k in lower for k in ["பைக்", "மோட்டார் சைக்கிள்", "இருசக்கர வாகனம்", "bike", "motorcycle", "scooter", "activa", "pulsar", "splendor", "vehicle"]):
        detected_objects.append("Two-wheeler / Motorbike")

    # Jewelry / Gold (Using word boundary for 'ring' to prevent false positive in 'wearing')
    if any(k in lower for k in ["தங்க சங்கிலி", "தங்கம்", "நகை", "செயின்", "gold", "chain", "jewel", "necklace", "pavan", "sovereign"]) or re.search(r'\b(ring|rings|earring|earrings)\b', lower):
        sov_match = re.search(r'(\d+)\s*(பவுன்|pavan|sovereign|gram|கிராம்)', lower)
        if sov_match:
            detected_objects.append(f"Gold jewelry ({sov_match.group(1)} {sov_match.group(2)})")
        else:
            detected_objects.append("Gold ornaments / chain")

    # Cash / Wallet / Purse
    if any(k in lower for k in ["பணம்", "ரூபாய்", "பணப்பை", "பர்ஸ்", "wallet", "purse", "cash", "rupees"]):
        cash_match = re.search(r'(?:rs\.?|ரூபாய்|inr)\s*([\d,]+)|([\d,]+)\s*(?:rs|ரூபாய்|rupees)', lower)
        if cash_match:
            val = cash_match.group(1) or cash_match.group(2)
            detected_objects.append(f"Cash / Currency (Rs. {val})")
        else:
            detected_objects.append("Cash / Wallet")

    # Documents / ID Cards
    if any(k in lower for k in ["ஆதார்", "பான் கார்டு", "லைசென்ஸ்", "வங்கி புத்தகம்", "aadhaar", "pan card", "driving license", "rc book", "passport", "atm card"]):
        detected_objects.append("Identity Documents / Bank Cards")

    # Bag (Ensure we don't false-positive match 'பை' inside 'மொபைல்' or 'பைக்' or 'கைபேசி')
    cleaned_for_bag = re.sub(r'(மொபைல்|கைபேசி|பைக்|bike|mobile)', '', lower)
    if any(k in cleaned_for_bag for k in ["கைப்பை", "தோள்பை", "தோள் பை", "பையில", "பையில்", "bag", "backpack", "suitcase"]):
        if not any("bag" in obj.lower() for obj in detected_objects):
            detected_objects.append("Bag / Backpack")
    elif re.search(r'(?:\s|^)பை(?:\s|[,\.]|$)', cleaned_for_bag):
        if not any("bag" in obj.lower() for obj in detected_objects):
            detected_objects.append("Bag")

    if detected_objects:
        object_property = ", ".join(detected_objects)

    # 3. Location of Incident
    location = "Not mentioned"
    loc_candidates = []

    # Common Tamil Nadu & standard locations
    landmarks = [
        ("பிராட்வே", "Broadway"),
        ("broadway", "Broadway"),
        ("பேருந்து நிலையம்", "Bus stand"),
        ("பஸ் நிலையம்", "Bus stand"),
        ("பஸ் ஸ்டாண்ட்", "Bus stand"),
        ("பஸ் ஸ்டாண்டில்", "Bus stand"),
        ("bus stand", "Bus stand"),
        ("bus stop", "Bus stop"),
        ("பேருந்து நிறுத்தம்", "Bus stop"),
        ("கோயம்பேடு", "Koyambedu"),
        ("koyambedu", "Koyambedu"),
        ("ரயில் நிலையம்", "Railway station"),
        ("railway station", "Railway station"),
        ("train station", "Railway station"),
        ("சென்ட்ரல்", "Central Railway Station"),
        ("central station", "Central Railway Station"),
        ("எழும்பூர்", "Egmore"),
        ("egmore", "Egmore"),
        ("தி.நகர்", "T. Nagar"),
        ("t.nagar", "T. Nagar"),
        ("t nagar", "T. Nagar"),
        ("மயிலாப்பூர்", "Mylapore"),
        ("mylapore", "Mylapore"),
        ("கிண்டி", "Guindy"),
        ("guindy", "Guindy"),
        ("தாம்பரம்", "Tambaram"),
        ("tambaram", "Tambaram"),
        ("வேளச்சேரி", "Velachery"),
        ("velachery", "Velachery"),
        ("அண்ணா நகர்", "Anna Nagar"),
        ("anna nagar", "Anna Nagar"),
        ("கல்லூரி", "College premises"),
        ("college", "College premises"),
        ("பள்ளி", "School premises"),
        ("school", "School premises"),
        ("மருத்துவமனை", "Hospital"),
        ("hospital", "Hospital"),
        ("சந்தை", "Market"),
        ("market", "Market / Bazaar"),
        ("பஜார்", "Bazaar"),
        ("ஏடிஎம்", "ATM kiosk"),
        ("atm", "ATM kiosk"),
        ("கோவில்", "Temple premises"),
        ("temple", "Temple premises"),
        ("சிக்னல்", "Traffic Signal junction"),
        ("signal", "Traffic Signal junction"),
        ("வீட்டில்", "Complainant's Residence"),
        ("வீடு", "Residence"),
        ("home", "Residence"),
        ("house", "Residence"),
        ("main road", "Main Road"),
        ("salai", "Salai / High Road")
    ]

    for term, label in landmarks:
        if term in lower:
            loc_candidates.append(label)

    # Check for Tamil locative suffix "இல்" / "ல்" / "near"
    near_match = re.search(r'(?:near|opposite|பக்கத்தில்|அருகில்)\s+([a-zA-Z0-9\s]{3,25}?)(?=\s+(?:my|the|his|her|and|while|when|was|is|\.)|$)', lower)
    if near_match:
        loc_candidates.append(near_match.group(1).strip().title())

    if loc_candidates:
        unique_locs = []
        for l in loc_candidates:
            matched = False
            for idx, existing in enumerate(unique_locs):
                if existing.lower() in l.lower():
                    unique_locs[idx] = l
                    matched = True
                    break
                elif l.lower() in existing.lower():
                    matched = True
                    break
            if not matched:
                unique_locs.append(l)
        location = ", ".join(unique_locs)

    # 4. Date of Incident
    date = "Not mentioned"
    if any(k in lower for k in ["நேற்று", "yesterday", "nethu"]):
        date = "Yesterday"
    elif any(k in lower for k in ["இன்று", "today", "iniku"]):
        date = "Today"
    elif any(k in lower for k in ["முந்தைய நாள்", "day before yesterday", "munthanathu"]):
        date = "Day before yesterday"
    else:
        # Check standard date formats: DD/MM/YYYY, DD-MM-YYYY, etc.
        date_match = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b', transcript)
        if date_match:
            date = date_match.group(1)

    # 5. Time of Incident
    time = "Not mentioned"
    time_periods = []
    if any(k in lower for k in ["காலை", "morning", "kaalai"]):
        time_periods.append("Morning")
    if any(k in lower for k in ["மதியம்", "afternoon", "noon", "mathiyam"]):
        time_periods.append("Afternoon")
    if any(k in lower for k in ["மாலை", "evening", "maalai"]):
        time_periods.append("Evening")
    if any(k in lower for k in ["இரவு", "night", "iravu"]):
        time_periods.append("Night")

    # Specific time regex: e.g. 6:30 PM, 8 மணி, 8:00 மணிக்கு
    specific_time_match = re.search(r'(\d{1,2}(?::\d{2})?)\s*(மணி|மணிக்கு|am|pm|a\.m\.|p\.m\.|hours|hrs)', lower)
    if specific_time_match:
        raw_val = specific_time_match.group(1)
        suffix = specific_time_match.group(2).lower()
        if ":" not in raw_val:
            raw_val = f"{raw_val}:00"
        
        if suffix in ["மணி", "மணிக்கு"]:
            if any(k in lower for k in ["மாலை", "இரவு", "மதியம்", "evening", "night", "afternoon"]):
                time_str = f"{raw_val} PM"
            else:
                time_str = f"{raw_val} AM"
        else:
            time_str = f"{raw_val} {suffix.upper().replace('.', '')}"
            
        if time_periods:
            time = f"{time_str} ({', '.join(time_periods)})"
        else:
            time = time_str
    elif time_periods:
        time = ", ".join(time_periods)

    # 6. Suspect / Person Involved
    suspect_person = "Not mentioned"
    if any(k in lower for k in [
        "யாரோ", "ஒரு நபர்", "அடையாளம் தெரியாத", "தெரியாத நபர்", "unknown person",
        "unidentified person", "someone", "stranger", "thief"
    ]):
        suspect_person = "Unidentified individual / Stranger"
    elif any(k in lower for k in ["இருவர்", "இரு நபர்கள்", "இரண்டு பேர்", "two persons", "two youths"]):
        suspect_person = "Two unidentified persons"
    elif any(k in lower for k in ["நண்பர்", "friend", "colleague", "பக்கத்து வீட்டுக்காரர்", "neighbor"]):
        suspect_person = "Acquaintance / Known associate"

    # Specific suspect name if formatted
    name_match = re.search(r'(?:named|பெயர்|named as)\s+([a-zA-Z\s]{3,20})', lower)
    if name_match:
        suspect_person = f"Identified as {name_match.group(1).strip().title()}"

    # 7. Suspect Physical Description & Attire
    person_description = "Not mentioned"
    desc_elements = []
    if any(k in lower for k in ["நீல சட்டை", "நீல உடை", "blue shirt", "blue dress"]):
        desc_elements.append("Wearing blue shirt")
    if any(k in lower for k in ["கருப்பு சட்டை", "கருப்பு உடை", "black shirt", "black clothes"]):
        desc_elements.append("Wearing black attire")
    if any(k in lower for k in ["சிவப்பு சட்டை", "red shirt"]):
        desc_elements.append("Wearing red shirt")
    if any(k in lower for k in ["ஹெல்மெட்", "helmet"]):
        desc_elements.append("Wearing helmet")
    if any(k in lower for k in ["பைக்", "bike", "pulsar", "activa"]):
        bike_match = re.search(r'(black|red|blue|white)?\s*(bike|pulsar|activa|two-wheeler)', lower)
        if bike_match:
            desc_elements.append(f"Riding {bike_match.group(0).strip()}")
    if any(k in lower for k in ["முகமூடி", "mask"]):
        desc_elements.append("Wearing face mask")

    if desc_elements:
        person_description = ", ".join(desc_elements)

    # 8. Detect Missing Critical Information and formulate Police Questions
    missing_critical_info = []

    if date == "Not mentioned":
        missing_critical_info.append({
            "field": "Exact Date of Occurrence",
            "question": "What is the exact calendar date on which the incident took place? (சம்பவம் நடந்த சரியான தேதி என்ன?)"
        })

    if time == "Not mentioned":
        missing_critical_info.append({
            "field": "Exact Time of Occurrence",
            "question": "What was the approximate or exact time of the occurrence? (சம்பவம் நடந்த நேரம் என்ன?)"
        })

    if location == "Not mentioned":
        missing_critical_info.append({
            "field": "Scene of Occurrence / Location",
            "question": "Where exactly did the incident occur (landmark, street, station limits)? (சம்பவம் எங்கு நடந்தது?)"
        })

    if object_property == "Not mentioned" and incident_type in ["Theft", "Missing / Lost Property", "Chain / Property Snatching", "Cheating / Cyber Financial Fraud"]:
        missing_critical_info.append({
            "field": "Property Specification & Estimated Value",
            "question": "What specific item/property was stolen/lost, its make, IMEI/serial number, and approximate value? (காணாமல் போன பொருளின் விவரம் மற்றும் மதிப்பு என்ன?)"
        })

    if suspect_person == "Not mentioned" and incident_type in ["Theft", "Physical Assault / Hurt", "Chain / Property Snatching", "Criminal Threat & Intimidation"]:
        missing_critical_info.append({
            "field": "Accused / Suspect Particulars",
            "question": "Did you see who committed the act? Can you describe their height, age, clothing, or vehicle? (சம்பவத்தில் ஈடுபட்ட நபரின் அடையாளம் அல்லது வாகன எண் தெரியுமா?)"
        })

    # 9. Formulate Objective Factual Synopsis
    synopsis_parts = []
    if complainant_name and complainant_name != "Citizen":
        synopsis_parts.append(f"Complainant {complainant_name}")
    else:
        synopsis_parts.append("The complainant")

    synopsis_parts.append(f"lodged an intake report regarding {incident_type.lower() if incident_type != 'Not mentioned' else 'an incident'}")

    if object_property != "Not mentioned":
        synopsis_parts.append(f"involving {object_property}")
    if location != "Not mentioned":
        synopsis_parts.append(f"at {location}")
    if date != "Not mentioned" or time != "Not mentioned":
        synopsis_parts.append(f"on {date} at around {time}")
    if suspect_person != "Not mentioned":
        synopsis_parts.append(f"by {suspect_person}")

    synopsis = " ".join(synopsis_parts).strip() + "."

    # 10. Generate Official Legal English CSR / Complaint Draft
    today_formatted = datetime.now().strftime("%d-%m-%Y")
    now_time = datetime.now().strftime("%H:%M hrs")

    formal_draft = f"""BEFORE THE STATION HOUSE OFFICER / DUTY OFFICER
CRIME & COMMUNITY SERVICE REGISTER (CSR) DIVISION

SUB: INTIMATION OF COMPLAINT REGARDING {incident_type.upper()} - REGARDING.

1. COMPLAINANT IDENTIFICATION:
   Name of Complainant : {complainant_name}
   Father / Spouse     : {father_name if father_name else 'Not stated'}
   Contact Phone       : {contact_number if contact_number else 'Not provided'}
   Residential Address : {residential_address if residential_address else 'Not stated'}
   Government ID       : {govt_id_masked if govt_id_masked else 'Not provided / Verified'}
   Recording Writer    : {station_writer_name}
   Intake Date & Time  : {today_formatted} at {now_time}

2. PARTICULARS OF OCCURRENCE:
   (a) Category of Offence / Incident : {incident_type}
   (b) Date of Occurrence             : {date}
   (c) Time of Occurrence             : {time}
   (d) Place of Occurrence / Scene    : {location}

3. PROPERTY / OBJECT PARTICULARS:
   Description of Property Involved   : {object_property}

4. SUSPECT / ACCUSED PARTICULARS:
   Suspect Mentioned / Identified    : {suspect_person}
   Physical Attributes / Description  : {person_description}

5. STATEMENT OF THE COMPLAINANT:
   The complainant appeared in person at the police station and submitted the following statement:
   "{transcript.strip()}"

6. FACTUAL SYNOPSIS & LEGAL PRAYER:
   {synopsis}
   
   WHEREFORE, it is humbly prayed that the Police Department may be pleased to register this complaint on the Community Service Register (CSR), initiate necessary preliminary enquiry / trace the missing property / investigate the alleged incident, and take appropriate lawful action in accordance with law.

VERIFICATION & ATTESTATION:
The above statement has been recorded faithfully from the oral/written submission of the complainant without additions or omissions. Read over and explained to the complainant in their native language and admitted by them to be correct.
"""

    missing_count = len(missing_critical_info)
    guidance = f"Officer, based on the citizen's statement, this case is identified as **{incident_type.upper()}**.\n"
    if "Theft" in incident_type:
        guidance += "• Applicable Law: **Section 303(2) Bharatiya Nyaya Sanhita (BNS)** / Section 379 IPC.\n"
    elif "Snatch" in incident_type:
        guidance += "• Applicable Law: **Section 304 BNS** (Robbery / Snatching - Cognizable offence).\n"
    elif "Assault" in incident_type:
        guidance += "• Applicable Law: **Section 115(2) BNS** (Voluntarily Causing Hurt) / Section 323 IPC.\n"
    elif "Lost" in incident_type or "Missing" in incident_type:
        guidance += "• Classification: **Non-Cognizable Lost Property Report** (CSR Entry / CEIR Portal).\n"
    elif "Cyber" in incident_type or "Fraud" in incident_type:
        guidance += "• Applicable Law: **Section 318(4) BNS & Section 66D IT Act 2000**.\n"

    if missing_count > 0:
        guidance += f"• Follow-up Required: Identified **{missing_count} missing critical details**. Click any prompt chip below to question the complainant."
    else:
        guidance += "• Verification: Essential occurrence parameters captured. Review the formal draft on the right pane."

    return {
        "case_type": incident_type,
        "incident_type": incident_type,
        "date": date,
        "time": time,
        "location": location,
        "object_property": object_property,
        "suspect_person": suspect_person,
        "person_description": person_description,
        "synopsis": synopsis,
        "agent_guidance": guidance,
        "recommended_sections": generate_recommended_sections(incident_type, transcript, object_property, suspect_person),
        "missing_critical_info": missing_critical_info,
        "formal_complaint_draft": formal_draft.strip(),
        "ai_provider": "Police Rule & Regex Engine (Offline Zero-Hallucination Fallback)"
    }


import concurrent.futures

def run_with_timeout(func, args=(), kwargs=None, timeout=3.5):
    """Execute a function in a thread with a hard timeout limit."""
    if kwargs is None:
        kwargs = {}
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func, *args, **kwargs)
    try:
        res = future.result(timeout=timeout)
        executor.shutdown(wait=False)
        return res
    except concurrent.futures.TimeoutError:
        executor.shutdown(wait=False)
        raise TimeoutError(f"Function {func.__name__} timed out after {timeout}s")
    except Exception as e:
        executor.shutdown(wait=False)
        raise e


def process_statement(transcript, new_input="", station_writer_name="Duty Officer", complainant_name="Citizen", contact_number="", father_name="", residential_address="", govt_id_masked=""):
    """
    Main orchestrator for processing complaint statements with multi-turn iterative merging.
    Attempts:
      1. Groq API (with 7.5s timeout)
      2. Google Gemini API (with 3.5s timeout)
      3. Offline Police Rule Engine (instant zero-hallucination fallback)
    """
    accumulated_transcript = transcript.strip()
    if new_input and new_input.strip():
        if accumulated_transcript:
            if new_input.strip() not in accumulated_transcript:
                accumulated_transcript = f"{accumulated_transcript}\n\n[Follow-up Response]: {new_input.strip()}"
        else:
            accumulated_transcript = new_input.strip()

    if not accumulated_transcript:
        return {
            "error": "Empty statement provided. Please provide oral or written testimony.",
            "raw_transcript": ""
        }

    # Complainant profile enrichment from accumulated transcript if fields are blank
    import re
    if not contact_number or contact_number in ("", "Not mentioned"):
        phone_match = re.search(r'\b(?:(?:\+?91[\-\s]?)?[6-9]\d{9})\b', accumulated_transcript)
        if phone_match:
            contact_number = phone_match.group(0).strip()

    if not complainant_name or complainant_name in ("Citizen", "Not mentioned", ""):
        name_match = re.search(r'(?:my name is|i am|complainant\s+|en peyar|en peru)\s+([A-Za-z\.\s]{3,30})', accumulated_transcript, re.IGNORECASE)
        if name_match:
            cand = name_match.group(1).strip()
            if cand.lower() not in ("writing", "reporting", "stating", "giving", "here"):
                complainant_name = cand

    if not father_name or father_name in ("", "Not mentioned"):
        father_match = re.search(r'(?:father(?:\'?s)? name is|s/o|son of|d/o|daughter of|w/o|wife of)\s+([A-Za-z\.\s]{3,30})', accumulated_transcript, re.IGNORECASE)
        if father_match:
            father_name = father_match.group(1).strip()

    result = None

    # 1. Try Groq first with timeout (sub-second response for fast models)
    if is_valid_key(GROQ_API_KEY):
        try:
            result = run_with_timeout(
                extract_with_groq,
                args=(accumulated_transcript, station_writer_name, complainant_name, contact_number, father_name, residential_address, govt_id_masked),
                timeout=7.5
            )
        except Exception as e:
            logger.info(f"Groq unavailable or timed out ({e}), trying Gemini.")

    # 2. Try Gemini second with timeout
    if not result and is_valid_key(GEMINI_API_KEY):
        try:
            result = run_with_timeout(
                extract_with_gemini,
                args=(accumulated_transcript, station_writer_name, complainant_name, contact_number, father_name, residential_address, govt_id_masked),
                timeout=3.5
            )
        except Exception as e:
            logger.info(f"Gemini unavailable or timed out ({e}), falling back to Offline Rule Engine.")

    # 3. Offline Rule Engine Fallback (Instant, 0% Hallucination)
    if not result:
        result = extract_with_rules(accumulated_transcript, station_writer_name, complainant_name, contact_number, father_name, residential_address, govt_id_masked)

    result["raw_transcript"] = accumulated_transcript
    result["complainant_name"] = complainant_name
    result["contact_number"] = contact_number
    result["father_name"] = father_name
    result["residential_address"] = residential_address
    result["govt_id_masked"] = govt_id_masked
    return result


def generate_copilot_advice(user_message, current_context=None):
    """
    AI Station Writer Co-Pilot:
    Advises the duty officer on applicable BNS/IPC sections, procedural steps,
    evidence preservation, and statutory guidelines.
    """
    context_str = json.dumps(current_context or {}, ensure_ascii=False)

    # 1. Try Groq first with timeout
    if is_valid_key(GROQ_API_KEY):
        def _call_groq_copilot():
            from groq import Groq
            client = Groq(api_key=GROQ_API_KEY)
            for m in ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b"]:
                try:
                    completion = client.chat.completions.create(
                        model=m,
                        messages=[
                            {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
                            {"role": "user", "content": f"Context: {context_str}\n\nOfficer Question: {user_message}"}
                        ],
                        temperature=0.1
                    )
                    return {"reply": clean_unicode_text(completion.choices[0].message.content.strip()), "provider": f"Groq ({m})"}
                except Exception:
                    continue
            raise Exception("All Groq models failed")

        try:
            return run_with_timeout(_call_groq_copilot, timeout=7.5)
        except Exception as e:
            logger.info(f"Copilot Groq unavailable or timed out ({e}), trying Gemini.")

    # 2. Try Gemini second with timeout
    if is_valid_key(GEMINI_API_KEY):
        def _call_gemini_copilot():
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=GEMINI_API_KEY, http_options=types.HttpOptions(timeout=3000))
            prompt = f"POLICE WRITER QUESTION: {user_message}\n\nCURRENT COMPLAINT CONTEXT:\n{context_str}\n\nProvide concise, authoritative police legal guidance."
            for m in ['gemini-2.5-flash', 'gemini-3.8-flash']:
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=prompt,
                        config=types.GenerateContentConfig(system_instruction=COPILOT_SYSTEM_PROMPT, temperature=0.1)
                    )
                    return {"reply": clean_unicode_text(response.text.strip()), "provider": f"Google Gemini ({m})"}
                except Exception:
                    continue
            raise Exception("All Gemini models failed")

        try:
            return run_with_timeout(_call_gemini_copilot, timeout=3.5)
        except Exception as e:
            logger.info(f"Copilot Gemini unavailable or timed out ({e}), falling back to Legal KB.")

    # 3. Comprehensive Police Legal Knowledge Base (Offline Fallback)
    msg_lower = user_message.lower()

    if any(k in msg_lower for k in ["theft", "stolen", "mobile", "phone", "திருட்டு"]):
        reply = (
            "[LEGAL ADVISORY] Applicable Provisions for Mobile / Property Theft:\n"
            "- Bharatiya Nyaya Sanhita (BNS) 2023: Section 303(2) [Theft] - Imprisonment up to 3 years or fine.\n"
            "- IPC Equivalent: Section 379 IPC.\n"
            "- Snatching Enhancement: If snatched from person's possession by force, invoke Section 304 BNS (Robbery / Snatching).\n\n"
            "[CHECKLIST] Required Station Writer Action Items:\n"
            "1. Obtain mobile purchase invoice / bill showing 15-digit IMEI-1 & IMEI-2.\n"
            "2. Collect active SIM card number and registered subscriber name.\n"
            "3. Issue CSR receipt and register on the CEIR (Central Equipment Identity Register) portal for immediate IMEI blocking and tower trace.\n"
            "4. Verify nearby CCTV cameras covering the scene of occurrence."
        )
    elif any(k in msg_lower for k in ["snatch", "snatching", "chain", "பறிப்பு"]):
        reply = (
            "[LEGAL ADVISORY] Applicable Provisions for Chain / Property Snatching:\n"
            "- Bharatiya Nyaya Sanhita (BNS) 2023: Section 304(1) / Section 304(2) [Snatching / Robbery].\n"
            "- IPC Equivalent: Section 392 / 379 IPC.\n"
            "- Cognizability: Cognizable offence. Warrantless arrest permitted. Immediate FIR mandated under Section 173 BNSS.\n\n"
            "[PROTOCOL] Station Writer Procedural Protocol:\n"
            "1. Collect approximate weight of gold ornament in sovereigns/grams and hallmark marks.\n"
            "2. Note description of suspect's two-wheeler (make, color, partial registration plate numbers).\n"
            "3. Immediately dispatch station crime patrol vehicle to coordinate with city traffic control room for vehicle interception."
        )
    elif any(k in msg_lower for k in ["assault", "hit", "beaten", "attack", "அடி"]):
        reply = (
            "[LEGAL ADVISORY] Applicable Provisions for Physical Assault:\n"
            "- Simple Hurt: Section 115(2) BNS 2023 (Section 323 IPC).\n"
            "- Grievous Hurt / Dangerous Weapon: Section 117 / 118 BNS 2023 (Section 324 / 326 IPC).\n"
            "- Criminal Intimidation: Section 351(2) BNS 2023 (Section 506 IPC).\n\n"
            "[PROTOCOL] Medical Examination Requirement:\n"
            "- Issue official Police Medical Memo immediately referring complainant to Government Hospital under Section 51 BNSS.\n"
            "- Await Wound Certificate (Accident Register copy) from medical officer before concluding preliminary enquiry."
        )
    elif any(k in msg_lower for k in ["cyber", "otp", "fraud", "scam", "bank", "money"]):
        reply = (
            "[LEGAL ADVISORY] Applicable Provisions for Cyber & Financial Cheating:\n"
            "- Information Technology Act 2000: Section 66C (Identity Theft) & Section 66D (Cheating by Personation using Computer Resource).\n"
            "- Bharatiya Nyaya Sanhita (BNS): Section 318(4) [Cheating] & Section 319.\n\n"
            "[PROTOCOL] Urgent Action Directive:\n"
            "1. Instruct citizen to dial National Cyber Crime Helpline 1930 immediately or register at cybercrime.gov.in.\n"
            "2. Procure Bank Account Number, Transaction Reference / UTR Number, and debit timestamp to freeze fraudulent beneficiary accounts within Golden Hour."
        )
    elif any(k in msg_lower for k in ["csr", "fir", "difference", "when"]):
        reply = (
            "[LEGAL ADVISORY] CSR vs. FIR Procedural Guidelines (Tamil Nadu Police Manual & BNSS):\n"
            "- CSR (Community Service Register): Issued for non-cognizable complaints, family/civil disputes, lost property, or when preliminary enquiry is permissible to verify prima facie cognizable allegations (within 14 days under Section 173(3) BNSS).\n"
            "- FIR (First Information Report): Must be registered immediately under Section 173(1) BNSS whenever information discloses a cognizable offence (e.g. robbery, housebreak, assault with injury, grievous threat).\n"
            "- Station Writer must issue a signed acknowledgment receipt to the citizen containing the Reference / CSR number."
        )
    else:
        reply = (
            f"[LEGAL ADVISORY] Station Writer Co-Pilot Guidance for '{user_message}':\n"
            "- Statutory Adherence: Ensure the complainant's statement is documented verbatim without adding extraneous facts.\n"
            "- Evidence Preservation: Prompt the citizen for exact timing, location landmarks, and property identification numbers (IMEI / Engine No / Bill).\n"
            "- Verification: Have the citizen sign or place their mark after the draft is read out in their mother tongue."
        )

    return {
        "reply": reply,
        "provider": "Police Knowledge Base (Offline Legal Fallback)"
    }
