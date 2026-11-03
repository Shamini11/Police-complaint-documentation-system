let recognition;
let isListening = false;


// Process Complaint
function processComplaint() {

    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const date = document.getElementById("date").value;
    const time = document.getElementById("time").value;
    const location = document.getElementById("location").value.trim();
    const complaint = document.getElementById("complaint").value.trim();

    const extracted = extractBasicInformation(complaint);
    const missingItems = detectMissingInformation(complaint);

document.getElementById("extractedInfo").innerHTML = `
    <div class="info-row">
        <strong>Incident Type:</strong>
        <span>${extracted.incidentType}</span>
    </div>

    <div class="info-row">
        <strong>Object:</strong>
        <span>${extracted.object}</span>
    </div>

    <div class="info-row">
        <strong>Location:</strong>
        <span>${extracted.location}</span>
    </div>

    <div class="info-row">
        <strong>Time:</strong>
        <span>${extracted.time}</span>
    </div>

    <div class="info-row">
        <strong>Date:</strong>
        <span>${extracted.date}</span>
    </div>

    <div class="info-row">
        <strong>Person involved:</strong>
        <span>${extracted.person}</span>
    </div>


<div class="info-row">
    <strong>Description:</strong>
    <span>${extracted.description}</span>
</div>

`;

if (missingItems.length === 0) {

    document.getElementById("missingInfo").innerHTML = `
        <div class="info-row">
            <strong>✓ Missing Information:</strong>
            <span>No obvious missing information detected.</span>
        </div>
    `;

} else {

    let missingHTML = "";

    missingItems.forEach(function(item) {

        missingHTML += `
            <div class="missing-item">

                <div class="info-row">
                    <strong>Missing: ${item.field}</strong>
                </div>

                <div class="question-row">
                    <strong>Suggested Question:</strong>
                    <span>${item.question}</span>
                </div>

            </div>
        `;

    });

    document.getElementById("missingInfo").innerHTML = missingHTML;
}
    

    const errorMessage = document.getElementById("errorMessage");
    const preview = document.getElementById("preview");

    errorMessage.textContent = "";

    if (
        name === "" ||
        phone === "" ||
        date === "" ||
        time === "" ||
        location === "" ||
        complaint === ""
    ) {

        errorMessage.textContent =
            "Please fill in all the required fields.";

        return;
    }

    document.getElementById("previewSection").style.display = "block";
document.getElementById("extractedSection").style.display = "block";
document.getElementById("missingSection").style.display = "block";
document.getElementById("reviewSection").style.display = "block";

    const incidentType = detectIncidentType(complaint);

    const importantKeywords = extractKeywords(complaint);

    preview.innerHTML = `

        <div class="complaint-preview">

            <h3>AI-Assisted Complaint Preview</h3>

            <div class="preview-item">
                <strong>Complainant Name:</strong>
                ${name}
            </div>

            <div class="preview-item">
                <strong>Contact Number:</strong>
                ${phone}
            </div>

            <div class="preview-item">
                <strong>Date of Incident:</strong>
                ${date}
            </div>

            <div class="preview-item">
                <strong>Time of Incident:</strong>
                ${time}
            </div>

            <div class="preview-item">
                <strong>Location:</strong>
                ${location}
            </div>

            <div class="preview-item">
                <strong>Detected Incident Type:</strong>
                ${incidentType}
            </div>

            <div class="preview-item">
                <strong>Important Keywords:</strong>
                ${importantKeywords}
            </div>

            <div class="preview-item">
                <strong>Original Complaint Statement:</strong>
                ${complaint}
            </div>

            <div class="verification-box">

                <strong>Factuality Notice:</strong>

                <p>
                    The original complaint statement is preserved.
                    The system does not add new facts.
                    The Writer must verify the details before approval.
                </p>

            </div>

        </div>

    `;


   const draft =
    "POLICE COMPLAINT / CSR DRAFT\n\n" +

    "BASIC INFORMATION\n" +
    "-------------------------\n" +
    "Complainant Name: " + name + "\n" +
    "Contact Number: " + phone + "\n\n" +

    "INCIDENT INFORMATION\n" +
    "-------------------------\n" +
    "Date of Incident: " + date + "\n" +
    "Time of Incident: " + time + "\n" +
    "Location of Incident: " + location + "\n" +
    "Incident Type: " + extracted.incidentType + "\n" +
    "Object / Property: " + extracted.object + "\n" +
    "Person Involved: " + extracted.person + "\n" +
    "Description: " + extracted.description + "\n\n" +

    "ORIGINAL COMPLAINT STATEMENT\n" +
    "-------------------------\n" +
    complaint + "\n\n" +

    "VERIFICATION NOTICE\n" +
    "-------------------------\n" +
    "This draft is generated from information provided by the complainant.\n" +
    "No unsupported facts should be added.\n" +
    "The original complaint statement must be preserved.\n" +
    "Writer verification and approval are required.";

    document.getElementById("reviewComplaint").value = draft;

    document.getElementById("approvalStatus").textContent = "";
}


// Detect Incident Type
function detectIncidentType(complaint) {

    const text = complaint.toLowerCase();

    if (
        text.includes("mobile") ||
        text.includes("phone") ||
        text.includes("stolen") ||
        text.includes("theft") ||
        text.includes("taken")
    ) {
        return "Possible Theft";
    }

    if (
        text.includes("accident") ||
        text.includes("vehicle") ||
        text.includes("bus") ||
        text.includes("car") ||
        text.includes("bike")
    ) {
        return "Possible Accident";
    }

    if (
        text.includes("attack") ||
        text.includes("hit") ||
        text.includes("beaten") ||
        text.includes("assault")
    ) {
        return "Possible Physical Assault";
    }

    if (
        text.includes("threat") ||
        text.includes("threatened")
    ) {
        return "Possible Threat";
    }

    if (
        text.includes("missing") ||
        text.includes("lost")
    ) {
        return "Possible Missing or Lost Property";
    }

    return "Incident Type Not Automatically Identified";
}


// Extract Keywords
function extractKeywords(complaint) {

    const keywords = [

        "mobile",
        "phone",
        "stolen",
        "theft",
        "accident",
        "vehicle",
        "bus",
        "car",
        "bike",
        "attack",
        "hit",
        "assault",
        "threat",
        "missing",
        "lost",
        "money",
        "document",
        "jewellery"

    ];

    const text = complaint.toLowerCase();

    const foundKeywords = keywords.filter(function(keyword) {

        return text.includes(keyword);

    });

    if (foundKeywords.length === 0) {

        return "No specific keywords identified";

    }

    return foundKeywords.join(", ");
}


// Writer Approval
function approveComplaint() {

    const reviewComplaint =
        document.getElementById("reviewComplaint").value.trim();

    const approvalStatus =
        document.getElementById("approvalStatus");

    if (reviewComplaint === "") {

        approvalStatus.textContent =
            "Please process the complaint before approval.";

        approvalStatus.className = "approval-error";

        return;
    }

    const confirmation =
        confirm(
            "Have you verified that the complaint draft matches the original statement?"
        );

    if (confirmation) {

        approvalStatus.textContent =
            "✓ Complaint Approved by Writer";

        approvalStatus.className = "approval-success";

    }
}


// Voice Input


if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    recognition = new SpeechRecognition();

    recognition.lang = "ta-IN";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = function () {
        document.getElementById("voiceStatus").innerText =
            "🎤 Listening... Speak in Tamil.";
    };

    recognition.onresult = function (event) {

        let transcript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {

            if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript;
            }
        }

        const complaintBox =
            document.getElementById("complaint");

        if (complaintBox.value.trim() !== "") {
            complaintBox.value += " " + transcript;
        } else {
            complaintBox.value = transcript;
        }
    };

    recognition.onerror = function (event) {

        document.getElementById("voiceStatus").innerText =
            "❌ Voice recognition error: " + event.error;
    };

    recognition.onend = function () {

        document.getElementById("voiceStatus").innerText =
            "⏹ Voice input stopped.";
    };

}

function startVoiceInput() {

    if (!recognition) {

        alert(
            "Speech recognition is not supported in this browser. Please use Google Chrome."
        );

        return;
    }

    try {
        recognition.start();

        document.getElementById("voiceStatus").innerText =
            "🎤 Listening... Speak in Tamil.";

    } catch (error) {
        console.log("Recognition already running.");
    }
}


function stopVoiceInput() {

    if (recognition) {

        recognition.abort();

        document.getElementById("voiceStatus").innerText =
            "⏹ Voice input stopped.";

    }
}


// Clear Complaint
function clearComplaint() {

    stopVoiceInput();

    document.getElementById("complaintForm").reset();

    document.getElementById("errorMessage").textContent = "";

    document.getElementById("preview").innerHTML = `

        <p class="empty-message">
            Processed complaint details will appear here.
        </p>

    `;

    document.getElementById("reviewComplaint").value = "";

    document.getElementById("approvalStatus").textContent = "";

    document.getElementById("voiceStatus").textContent =
        "Voice input is ready.";
}

// ==========================================
// STAGE 7 - BASIC INFORMATION EXTRACTION
// ==========================================

function extractBasicInformation(text) {

    const lowerText = text.toLowerCase();

    let incidentType = "Not mentioned";
    let object = "Not mentioned";
    let location = "Not mentioned";
    let time = "Not mentioned";
    let date = "Not mentioned";
    let person = "Not mentioned";
    let description = "Not mentioned";

    // -----------------------------
    // INCIDENT TYPE
    // -----------------------------

    if (
        lowerText.includes("திருடு") ||
        lowerText.includes("திருட்டு") ||
        lowerText.includes("திருடப்பட்டது") ||
        lowerText.includes("திருடி") ||
        lowerText.includes("திருட") ||
        lowerText.includes("stolen") ||
        lowerText.includes("theft")
    ) {
        incidentType = "Theft";
    }
    else if (
        lowerText.includes("காணாமல்") ||
        lowerText.includes("காணவில்லை") ||
        lowerText.includes("தொலைந்து") ||
        lowerText.includes("missing") ||
        lowerText.includes("lost")
    ) {
        incidentType = "Missing / Lost";
    }
    else if (
        lowerText.includes("விபத்து") ||
        lowerText.includes("accident")
    ) {
        incidentType = "Accident";
    }
    else if (
        lowerText.includes("அடித்த") ||
        lowerText.includes("தாக்க") ||
        lowerText.includes("தாக்குதல்") ||
        lowerText.includes("assault")
    ) {
        incidentType = "Assault";
    }
    else if (
        lowerText.includes("மிரட்ட") ||
        lowerText.includes("மிரட்டல்") ||
        lowerText.includes("threat")
    ) {
        incidentType = "Threat";
    }


    // -----------------------------
    // OBJECT
    // -----------------------------

    if (
        lowerText.includes("அலைபேசி") ||
        lowerText.includes("கைபேசி") ||
        lowerText.includes("செல்போன்") ||
        lowerText.includes("மொபைல்") ||
        lowerText.includes("போன்") ||
        lowerText.includes("phone") ||
        lowerText.includes("mobile")
    ) {
        object = "Mobile phone";
    }
    else if (
        lowerText.includes("மடிக்கணினி") ||
        lowerText.includes("லேப்டாப்") ||
        lowerText.includes("laptop")
    ) {
        object = "Laptop";
    }
    else if (
        lowerText.includes("பைக்") ||
        lowerText.includes("மோட்டார் சைக்கிள்") ||
        lowerText.includes("motorcycle") ||
        lowerText.includes("bike")
    ) {
        object = "Bike";
    }
    else if (
        lowerText.includes("பை") ||
        lowerText.includes("bag")
    ) {
        object = "Bag";
    }


    // -----------------------------
    // LOCATION
    // -----------------------------

    if (
        lowerText.includes("பேருந்து நிலையம்") ||
        lowerText.includes("பஸ் நிலையம்") ||
        lowerText.includes("bus stand") ||
        lowerText.includes("bus station")
    ) {
        location = "Bus stand";
    }
    else if (
        lowerText.includes("கல்லூரி") ||
        lowerText.includes("college")
    ) {
        location = "College";
    }
    else if (
        lowerText.includes("பள்ளி") ||
        lowerText.includes("school")
    ) {
        location = "School";
    }
    else if (
        lowerText.includes("வீட்டில்") ||
        lowerText.includes("வீடு") ||
        lowerText.includes("home") ||
        lowerText.includes("house")
    ) {
        location = "Home";
    }


    // -----------------------------
    // DATE
    // -----------------------------

    if (
        lowerText.includes("நேற்று") ||
        lowerText.includes("yesterday")
    ) {
        date = "Yesterday";
    }
    else if (
        lowerText.includes("இன்று") ||
        lowerText.includes("today")
    ) {
        date = "Today";
    }


    // -----------------------------
    // TIME
    // -----------------------------

    if (
        lowerText.includes("காலை") ||
        lowerText.includes("morning")
    ) {
        time = "Morning";
    }
    else if (
        lowerText.includes("மதியம்") ||
        lowerText.includes("afternoon")
    ) {
        time = "Afternoon";
    }
    else if (
        lowerText.includes("மாலை") ||
        lowerText.includes("evening")
    ) {
        time = "Evening";
    }
    else if (
        lowerText.includes("இரவு") ||
        lowerText.includes("night")
    ) {
        time = "Night";
    }


    // -----------------------------
    // SPECIFIC TIME
    // Example: 8 மணி / 8 மணிக்கு
    // -----------------------------

    const timeMatch = text.match(
        /(\d{1,2})\s*(மணி|மணிக்கு|am|pm)/i
    );

    if (timeMatch) {
        time = timeMatch[1] + " " + timeMatch[2];
    }


    // -----------------------------
    // PERSON
    // -----------------------------

    if (
        lowerText.includes("யாரோ") ||
        lowerText.includes("ஒரு நபர்") ||
        lowerText.includes("நபர்") ||
        lowerText.includes("someone") ||
        lowerText.includes("person")
    ) {
        person = "Person mentioned in complaint";
    }


    // -----------------------------
    // PERSON LOCATION / RELATION
    // -----------------------------

    if (
        lowerText.includes("பக்கத்தில் இருந்த") ||
        lowerText.includes("என் பக்கத்தில்") ||
        lowerText.includes("அருகில் இருந்த") ||
        lowerText.includes("அருகில்")
    ) {
        person = "Person near the complainant";
    }


    // -----------------------------
    // CLOTHING / APPEARANCE
    // -----------------------------

    if (
        lowerText.includes("நீல உடை") ||
        lowerText.includes("நீல சட்டை") ||
        lowerText.includes("நீல நிற") ||
        lowerText.includes("blue shirt") ||
        lowerText.includes("blue clothes")
    ) {
        description = "Person wearing blue clothing";
    }


    return {
        incidentType: incidentType,
        object: object,
        location: location,
        time: time,
        date: date,
        person: person,
        description: description
    };
}

// ==========================================
// STAGE 8 - MISSING INFORMATION DETECTION
// ==========================================

function detectMissingInformation(text) {

    const lowerText = text.toLowerCase();

    let missingItems = [];

    // Check date
    if (
        !lowerText.includes("நேற்று") &&
        !lowerText.includes("இன்று") &&
        !lowerText.includes("நாள்") &&
        !lowerText.includes("yesterday") &&
        !lowerText.includes("today") &&
        !lowerText.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)
    ) {
        missingItems.push({
            field: "Date",
            question: "What was the date when the incident happened?"
        });
    }

    // Check time
    if (
        !lowerText.includes("காலை") &&
        !lowerText.includes("மதியம்") &&
        !lowerText.includes("மாலை") &&
        !lowerText.includes("இரவு") &&
        !lowerText.includes("மணி") &&
        !lowerText.includes("am") &&
        !lowerText.includes("pm")
    ) {
        missingItems.push({
            field: "Time",
            question: "What was the exact time when the incident happened?"
        });
    }

    // Check location
    if (
        !lowerText.includes("இல்") &&
        !lowerText.includes("இடத்தில்") &&
        !lowerText.includes("நிலையம்") &&
        !lowerText.includes("கல்லூரி") &&
        !lowerText.includes("பள்ளி") &&
        !lowerText.includes("வீடு") &&
        !lowerText.includes("பேருந்து") &&
        !lowerText.includes("college") &&
        !lowerText.includes("school") &&
        !lowerText.includes("home") &&
        !lowerText.includes("bus")
    ) {
        missingItems.push({
            field: "Location",
            question: "Where exactly did the incident happen?"
        });
    }

    // Check object/property
    if (
        !lowerText.includes("அலைபேசி") &&
        !lowerText.includes("கைபேசி") &&
        !lowerText.includes("மொபைல்") &&
        !lowerText.includes("போன்") &&
        !lowerText.includes("பை") &&
        !lowerText.includes("மடிக்கணினி") &&
        !lowerText.includes("லேப்டாப்") &&
        !lowerText.includes("bike") &&
        !lowerText.includes("phone") &&
        !lowerText.includes("mobile") &&
        !lowerText.includes("bag") &&
        !lowerText.includes("laptop")
    ) {
        missingItems.push({
            field: "Object / Property",
            question: "What item or property was involved in the incident?"
        });
    }

    // Check person information
    if (
        !lowerText.includes("நபர்") &&
        !lowerText.includes("யாரோ") &&
        !lowerText.includes("அவர்") &&
        !lowerText.includes("அவள்") &&
        !lowerText.includes("நண்பர்") &&
        !lowerText.includes("someone") &&
        !lowerText.includes("person") &&
        !lowerText.includes("friend")
    ) {
        missingItems.push({
            field: "Person involved",
            question: "Was any person involved or seen during the incident?"
        });
    }

    return missingItems;
}