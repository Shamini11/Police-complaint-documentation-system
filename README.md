# Police Complaint Documentation System
### AI-Assisted Complaint Registration & Legal Documentation (M.Tech Project)

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1%2B-green.svg)](https://palletsprojects.com/p/flask/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey.svg)](https://www.sqlite.org/)
[![ReportLab](https://img.shields.io/badge/PDF%20Engine-ReportLab-red.svg)](https://www.reportlab.com/)
[![License](https://img.shields.io/badge/License-Academic%20%2F%20College-orange.svg)]()

A comprehensive, production-grade web application engineered to modernize and streamline police complaint intake at police station front desks. Designed specifically for Station Duty Writers, this system couples continuous audio recording, Tamil/Tanglish/English speech recognition, and a dual-LLM zero-hallucination extraction engine with Bharatiya Nyaya Sanhita (BNS) 2023 / BNSS legal recommendations, digital signature attestation, and official ReportLab PDF export.

---

## 🏛️ System Architecture & Workflow

The system is built on a structured **3-Column Single-Page Layout** optimized for high-pressure station duty desks:

```
+------------------------------------+--------------------------------------+------------------------------------+
|            LEFT COLUMN             |            CENTER COLUMN             |            RIGHT COLUMN            |
|       (Navigation & Legal)         |          (Writer & Intake)           |         (Review & Dossier)         |
+------------------------------------+--------------------------------------+------------------------------------+
| • Station Identification & Time    | • Part 1: Station Writer Details     | • Structured Crime Matrix          |
| • Quick Navigation Tabs            |   - Name, ID, Digital Signature Canvas|   - Extracted Parameters           |
| • Dynamic AI Recommended Legal     | • Part 2: Complainant Information    | • AI Missing Critical Info Chips   |
|   Sections (BNS 2023, BNSS, IT Act)|   - Name, Phone, Masked Aadhaar      | • Editable Formal English Draft    |
| • Drag & Drop / One-Click Insert   | • Part 3: Continuous Audio Intake    | • Complainant Signature Canvas     |
|   into Editable CSR Draft          |   - Speech-to-Text (ta-IN / en-IN)   | • Official ReportLab PDF Export    |
| • Statutory Factuality Warning     |   - Iterative 'FIND' Fact Extraction | • SQLite Database Persistence      |
+------------------------------------+--------------------------------------+------------------------------------+
```

---

## ✨ Key Features

### 1. Multi-Turn Iterative 'FIND' & Zero-Hallucination Extraction
- **Dual-LLM Pipeline:** Powered by **Groq API** (`llama-3.3-70b`, `gpt-oss-120b`) and **Google Gemini API** (`gemini-2.5-flash`), with sub-second execution and automatic timeout fallbacks.
- **Offline Rule & Regex Engine:** 100% zero-hallucination deterministic fallback engine supporting Tamil script, Tanglish (Romanized Tamil), and English.
- **Strict Anti-Hallucination Directive:** Automatically tags unmentioned parameters strictly as `"Not mentioned"` and never fabricates suspects, vehicles, or stolen values.

### 2. Dynamic AI Recommended Legal & Procedural Sections
- **Context-Aware Recommendations:** Automatically identifies applicable statutory provisions based on citizen narratives:
  - **Theft:** BNS 303(2) / IPC 379, CEIR IMEI Blacklisting Requisition, Sec 105 BNSS Seizure Mahazar, Sec 94 BNSS CCTV Preservation.
  - **Robbery / Chain Snatching:** BNS 304 / IPC 392, Sec 105 BNSS Audio-Visual Panchnama, VHF Interception Alert.
  - **Physical Assault:** BNS 115(2) / IPC 323, BNS 351(2) Criminal Intimidation, Sec 51 BNSS Medico-Legal Hospital Requisition & Wound Certificate.
  - **Cyber Financial Fraud:** IT Act Section 66D, BNS 318(4) Cheating, 1930 / CFCFRMS Immediate Bank Debit Freeze.
  - **Lost Property:** Non-Cognizable CSR Entry, CEIR Lost Smartphone Submission.
- **Drag-and-Drop & Instant Insert:** Duty writers can drag cards or click **"Insert into Draft"** to append formatted legal clauses into the CSR complaint text.

### 3. Continuous Audio Session Recording
- Single start-to-finish continuous audio recording per complaint session (`static/uploads/audio/`).
- Eliminates fragmented audio files and preserves raw audio evidence mapped to the case reference ID.

### 4. Dual Digital Signature Canvases & Official Police Seal
- **Complainant Signature Pad:** Touch/mouse HTML5 canvas for electronic attestation with undo/clear capabilities.
- **Writer Signature Pad:** Dedicated officer canvas for duty desk validation.
- **Station Writer Official Seal:** Embedded dynamic visual stamp block rendering station name, officer ID, verification watermark, and date.

### 5. Publication-Grade ReportLab PDF Export
- Generates official Community Service Register (CSR) & FIR complaint documentation.
- Formatted A4 layout with department header, administrative metadata table, formal complaint draft, original verbatim statement, audio archive verification, and side-by-side 3-column signature and seal table.

### 6. History & Records Management Dashboard
- Full SQLite persistence (`complaints.db`) supporting Draft, Saved, and Approved workflows.
- Live search by reference ID, complainant name, phone number, category tabs, and status filters.
- Modal inspection, instant PDF download, direct browser printing, and record deletion.

### 7. AI Legal & Procedural Co-Pilot Modal
- Conversational advisor guiding the duty officer on procedural laws, Section 173 BNSS compliance, cognizable vs. non-cognizable distinctions, and evidence preservation checklists.

---

## 🛠️ Technology Stack

- **Backend:** Python 3.10+, Flask 3.1+, SQLite3 (WAL mode)
- **AI & LLM Services:** Google GenAI SDK (`google-genai`), Groq Python SDK (`groq`)
- **PDF Generation:** ReportLab 4.2+
- **Frontend:** Semantic HTML5, CSS3 (Police Navy & Slate Grey Theme), Vanilla JavaScript (ES6+)
- **Audio & Media:** Web Audio API, MediaStream Recording API, Web Speech API (`webkitSpeechRecognition`)

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/Shamini11/Police-complaint-documentation-system.git
cd Police-complaint-documentation-system
```

### 2. Create and Activate a Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the `.env.example` template to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and supply your API keys (optional if using the offline engine):
```env
# Dual-LLM API Keys
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Flask Settings
FLASK_SECRET_KEY=your_secure_random_key_here
PORT=5000
DEBUG=True

# Station Identity Metadata
POLICE_STATION_NAME=Central Police Station, Division-I
POLICE_DISTRICT=Chennai City Police / Tamil Nadu Police
POLICE_STATE=Tamil Nadu
```

### 5. Run the Application
```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 📂 Project Directory Structure

```
Police-complaint-documentation-system/
├── app.py                     # Flask server routes & API endpoints
├── database.py                # SQLite database management, indexing & CRUD
├── extraction.py              # Dual-LLM & Offline Rule Engine for entity extraction
├── pdf_generator.py           # ReportLab publication-grade PDF generator
├── requirements.txt           # Python dependency specifications
├── .env.example               # Sanitized environment configuration template
├── .gitignore                 # Standard security and build exclusions
├── README.md                  # Comprehensive project documentation
├── static/
│   ├── css/
│   │   └── style.css          # Police Navy & Slate Grey UI styling
│   ├── js/
│   │   ├── app.js             # 3-column workspace, canvas pads & audio recorder
│   │   └── api.js             # History dashboard, search, filters & KPI stats
│   └── uploads/
│       └── audio/             # Single continuous audio recording archive
└── templates/
    ├── index.html             # Main 3-column intake workspace & co-pilot modal
    └── history.html           # Saved complaints history dashboard
```

---

## 📄 Compliance & Legal Notice
- **Section 173(1) BNSS:** Verbatim recording of complainant statements without fabricated details.
- **Section 217 Bharatiya Nyaya Sanhita (BNS):** Strict factual attestation against false reporting.
- Designed as an academic project demonstrating human-in-the-loop AI assistance for public safety administration.
