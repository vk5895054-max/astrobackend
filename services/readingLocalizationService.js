// Locale-aware labels and boilerplate for Face Reading / Palm Reading reports.
//
// The AI narrative is translated by `withResponseLanguage`, but the structural
// labels (forehead, heart line, ...), the disclaimer and the "Keep in mind:"
// prefix are generated on the server. Keeping them here means changing the app
// language changes the whole report, not just the model's prose.

const FACE_AREA_ORDER = [
  "forehead",
  "eyes",
  "nose",
  "lips",
  "chin",
  "faceShape",
];

const PALM_AREA_ORDER = [
  "heartLine",
  "headLine",
  "lifeLine",
  "fateLine",
  "mountsAndTexture",
];

const GRAPHOLOGY_AREA_ORDER = [
  "slant",
  "letterSize",
  "spacing",
  "baseline",
  "writingPressure",
  "letterForms",
];

const DRAWING_AREA_ORDER = [
  "subjectMatter",
  "composition",
  "lineAndStroke",
  "shapeAndForm",
  "colorUse",
  "detailsAndSymbols",
];

const FACE_AREAS = {
  "en-US": {
    forehead: "Forehead",
    eyes: "Eyes",
    nose: "Nose",
    lips: "Lips",
    chin: "Chin",
    faceShape: "Face shape",
  },
  "hi-IN": {
    forehead: "माथा",
    eyes: "आँखें",
    nose: "नाक",
    lips: "होंठ",
    chin: "ठोड़ी",
    faceShape: "चेहरे का आकार",
  },
  "en-IN": {
    forehead: "Forehead",
    eyes: "Aankhen",
    nose: "Naak",
    lips: "Honth",
    chin: "Chin",
    faceShape: "Face shape",
  },
};

const PALM_AREAS = {
  "en-US": {
    heartLine: "Heart line",
    headLine: "Head line",
    lifeLine: "Life line",
    fateLine: "Fate line",
    mountsAndTexture: "Mounts and texture",
  },
  "hi-IN": {
    heartLine: "हृदय रेखा",
    headLine: "बुद्धि रेखा",
    lifeLine: "जीवन रेखा",
    fateLine: "भाग्य रेखा",
    mountsAndTexture: "ग्रंथियाँ और बनावट",
  },
  "en-IN": {
    heartLine: "Heart line",
    headLine: "Head line",
    lifeLine: "Life line",
    fateLine: "Fate line",
    mountsAndTexture: "Mounts and texture",
  },
};

const GRAPHOLOGY_AREAS = {
  "en-US": {
    slant: "Letter slant",
    letterSize: "Letter size",
    spacing: "Spacing",
    baseline: "Baseline",
    writingPressure: "Visible pen pressure",
    letterForms: "Letter forms",
  },
  "hi-IN": {
    slant: "अक्षरों का झुकाव",
    letterSize: "अक्षरों का आकार",
    spacing: "शब्दों और अक्षरों के बीच दूरी",
    baseline: "लिखावट की आधार रेखा",
    writingPressure: "पेन के दबाव के निशान",
    letterForms: "अक्षरों की बनावट",
  },
  "en-IN": {
    slant: "Letter slant",
    letterSize: "Letter size",
    spacing: "Spacing",
    baseline: "Writing baseline",
    writingPressure: "Visible pen pressure",
    letterForms: "Letter forms",
  },
};

const DRAWING_AREAS = {
  "en-US": {
    subjectMatter: "Subject and content",
    composition: "Composition and layout",
    lineAndStroke: "Lines and strokes",
    shapeAndForm: "Shapes and forms",
    colorUse: "Colors",
    detailsAndSymbols: "Small details and symbols",
  },
  "hi-IN": {
    subjectMatter: "विषय और सामग्री",
    composition: "रचना और लेआउट",
    lineAndStroke: "रेखाएँ और स्ट्रोक",
    shapeAndForm: "आकार और रूप",
    colorUse: "रंग",
    detailsAndSymbols: "छोटे विवरण और प्रतीक",
  },
  "en-IN": {
    subjectMatter: "Subject aur content",
    composition: "Composition aur layout",
    lineAndStroke: "Lines aur strokes",
    shapeAndForm: "Shapes aur forms",
    colorUse: "Colors",
    detailsAndSymbols: "Chote details aur symbols",
  },
};

const DISCLAIMERS = {
  "en-US":
    "This is a traditional, entertainment-focused interpretation based only on visible features in the submitted photo. It is not a medical, psychological, legal or financial assessment and does not guarantee any outcome.",
  "hi-IN":
    "यह पारंपरिक, मनोरंजन-केंद्रित व्याख्या है जो केवल आपकी फ़ोटो में दिखने वाले लक्षणों पर आधारित है। यह चिकित्सा, मनोवैज्ञानिक, कानूनी या वित्तीय मूल्यांकन नहीं है और किसी भी परिणाम की गारंटी नहीं देती।",
  "en-IN":
    "Yeh ek traditional, entertainment-focused interpretation hai jo sirf aapki photo me dikhte hue features par aadharit hai. Yeh medical, psychological, legal ya financial assessment nahi hai aur kisi bhi result ki guarantee nahi deta.",
};

const GRAPHOLOGY_DISCLAIMERS = {
  "en-US":
    "This is an entertainment-focused interpretation based only on visible handwriting in the submitted photo. Graphology is not scientifically validated; this is not a medical, psychological, legal or financial assessment and does not guarantee any outcome.",
  "hi-IN":
    "यह मनोरंजन-केंद्रित व्याख्या आपकी फ़ोटो में दिखने वाली लिखावट पर आधारित है। ग्राफ़ोलॉजी वैज्ञानिक रूप से प्रमाणित नहीं है; यह चिकित्सा, मनोवैज्ञानिक, कानूनी या वित्तीय मूल्यांकन नहीं है और किसी परिणाम की गारंटी नहीं देती।",
  "en-IN":
    "Yeh entertainment-focused interpretation photo me dikhne wali handwriting par based hai. Graphology scientifically validated nahi hai; yeh medical, psychological, legal ya financial assessment nahi hai aur kisi result ki guarantee nahi deta.",
};

const DRAWING_DISCLAIMERS = {
  "en-US":
    "This is an exploratory, entertainment-focused reflection based only on what is visible in the submitted drawing — subject matter, colors, shapes, patterns, composition and small details. It is not a diagnostic, medical, psychological, educational, legal or financial assessment and does not establish facts about the artist, including age, gender, identity, ability, personality or wellbeing.",
  "hi-IN":
    "यह एक अन्वेषणात्मक, मनोरंजन-केंद्रित चिंतन है जो केवल ड्राइंग में दिखने वाली चीज़ों पर आधारित है — विषय, रंग, आकार, पैटर्न, रचना और छोटे विवरण। यह निदान, चिकित्सा, मनोवैज्ञानिक, शैक्षिक, कानूनी या वित्तीय मूल्यांकन नहीं है और कलाकार के बारे में उम्र, लिंग, पहचान, क्षमता, व्यक्तित्व या कल्याण जैसे तथ्य स्थापित नहीं करता।",
  "en-IN":
    "Yeh ek exploratory, entertainment-focused chintan hai jo sirf drawing me dikhne wali cheezon par based hai — subject, colors, shapes, patterns, composition aur chote details. Yeh diagnosis, medical, psychological, educational, legal ya financial assessment nahi hai aur artist ke baare me umr, gender, identity, ability, personality ya wellbeing jaise tathya establish nahi karta.",
};

const CAUTION_PREFIX = {
  "en-US": "Keep in mind: ",
  "hi-IN": "ध्यान दें: ",
  "en-IN": "Dhyan dein: ",
};

const FEATURE_LABELS = {
  "en-US": {
    face: "Face Reading",
    palm: "Palm Reading",
    graphology: "Graphology Reading",
    drawing: "Drawing Analysis",
  },
  "hi-IN": {
    face: "चेहरा पढ़ना",
    palm: "हाथ पढ़ना",
    graphology: "हस्तलेखन विश्लेषण",
    drawing: "ड्राइंग विश्लेषण",
  },
  "en-IN": {
    face: "Face reading",
    palm: "Palm reading",
    graphology: "Graphology reading",
    drawing: "Drawing analysis",
  },
};

// User-facing messages owned by the Face/Palm feature. The generic API
// localization layer handles Hindi for shared responses, but these need
// locale-aware text in the controller itself (notably for en-IN Hinglish).
const MESSAGES = {
  "en-US": {
    uploadRequiredFace: "Please upload at least one clear photo for face reading.",
    uploadRequiredPalm: "Please upload at least one clear photo for palm reading.",
    consentRequired: "Please give consent before processing your photo.",
    emptyPhoto: "The uploaded photo is empty.",
    unsupportedFormat: "Please upload a JPEG, PNG, WebP or HEIC photo.",
    tooSmall: "The photo looks too small. Please upload a clearer image.",
    insufficientBalance:
      "Your free readings are finished. Please recharge your wallet to continue.",
    unavailableFace:
      "Face Reading is temporarily unavailable. Please try again in a moment.",
    unavailablePalm:
      "Palm Reading is temporarily unavailable. Please try again in a moment.",
    uploadRequiredGraphology:
      "Please upload a clear handwriting sample for graphology.",
    unavailableGraphology:
      "Graphology analysis is temporarily unavailable. Please try again in a moment.",
    reportReadyFace: "Face Reading report ready",
    reportReadyPalm: "Palm Reading report ready",
    reportReadyGraphology: "Graphology report ready",
    deletedFace: "Face Reading report and photos deleted",
    deletedPalm: "Palm Reading report and photos deleted",
    deletedGraphology: "Graphology report and photos deleted",
    uploadRequiredDrawing: "Please upload a clear photo of your drawing.",
    unavailableDrawing:
      "Drawing Analysis is temporarily unavailable. Please try again in a moment.",
    reportReadyDrawing: "Drawing Analysis report ready",
    deletedDrawing: "Drawing Analysis report and photos deleted",
  },
  "hi-IN": {
    uploadRequiredFace: "चेहरा पढ़ने के लिए कृपया कम से कम एक स्पष्ट फ़ोटो अपलोड करें।",
    uploadRequiredPalm: "हाथ पढ़ने के लिए कृपया कम से कम एक स्पष्ट फ़ोटो अपलोड करें।",
    consentRequired: "आपकी फ़ोटो प्रोसेस करने से पहले कृपया सहमति दें।",
    emptyPhoto: "अपलोड की गई फ़ोटो खाली है।",
    unsupportedFormat: "कृपया JPEG, PNG, WebP या HEIC फ़ोटो अपलोड करें।",
    tooSmall: "फ़ोटो बहुत छोटी लग रही है। कृपया एक स्पष्ट तस्वीर अपलोड करें।",
    insufficientBalance:
      "आपकी मुफ़्त रीडिंग्स खत्म हो गई हैं। जारी रखने के लिए कृपया अपना वॉलेट रिचार्ज करें।",
    unavailableFace: "चेहरा पढ़ना अभी अस्थायी रूप से उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    unavailablePalm: "हाथ पढ़ना अभी अस्थायी रूप से उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    uploadRequiredGraphology: "ग्राफ़ोलॉजी के लिए कृपया लिखावट का स्पष्ट नमूना अपलोड करें।",
    unavailableGraphology: "हस्तलेखन विश्लेषण अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    reportReadyFace: "चेहरा पढ़ने की रिपोर्ट तैयार है",
    reportReadyPalm: "हाथ पढ़ने की रिपोर्ट तैयार है",
    reportReadyGraphology: "हस्तलेखन विश्लेषण की रिपोर्ट तैयार है",
    deletedFace: "चेहरा पढ़ने की रिपोर्ट और फ़ोटो हटा दी गईं",
    deletedPalm: "हाथ पढ़ने की रिपोर्ट और फ़ोटो हटा दी गईं",
    deletedGraphology: "हस्तलेखन विश्लेषण की रिपोर्ट और फ़ोटो हटा दी गईं",
    uploadRequiredDrawing: "कृपया अपनी ड्राइंग की स्पष्ट फ़ोटो अपलोड करें।",
    unavailableDrawing: "ड्राइंग विश्लेषण अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    reportReadyDrawing: "ड्राइंग विश्लेषण की रिपोर्ट तैयार है",
    deletedDrawing: "ड्राइंग विश्लेषण की रिपोर्ट और फ़ोटो हटा दी गईं",
  },
  "en-IN": {
    uploadRequiredFace: "Face reading ke liye kripya kam se kam ek clear photo upload karein.",
    uploadRequiredPalm: "Palm reading ke liye kripya kam se kam ek clear photo upload karein.",
    consentRequired: "Aapki photo process karne se pehle kripya consent dein.",
    emptyPhoto: "Upload ki gayi photo khali hai.",
    unsupportedFormat: "Kripya JPEG, PNG, WebP ya HEIC photo upload karein.",
    tooSmall: "Photo bahut chhoti lag rahi hai. Kripya ek clear image upload karein.",
    insufficientBalance:
      "Aapki free readings khatam ho gayi hain. Jaari rakhne ke liye kripya wallet recharge karein.",
    unavailableFace: "Face reading abhi temporarily available nahi hai. Kripya thodi der baad try karein.",
    unavailablePalm: "Palm reading abhi temporarily available nahi hai. Kripya thodi der baad try karein.",
    uploadRequiredGraphology: "Graphology ke liye handwriting ka clear sample upload karein.",
    unavailableGraphology: "Graphology analysis abhi temporarily available nahi hai. Kripya baad mein try karein.",
    reportReadyFace: "Face reading report taiyar hai",
    reportReadyPalm: "Palm reading report taiyar hai",
    reportReadyGraphology: "Graphology report taiyar hai",
    deletedFace: "Face reading report aur photos delete ho gayi",
    deletedPalm: "Palm reading report aur photos delete ho gayi",
    deletedGraphology: "Graphology report aur photos delete ho gayi",
    uploadRequiredDrawing: "Kripya apni drawing ki clear photo upload karein.",
    unavailableDrawing:
      "Drawing analysis abhi temporarily available nahi hai. Kripya thodi der baad try karein.",
    reportReadyDrawing: "Drawing analysis report taiyar hai",
    deletedDrawing: "Drawing analysis report aur photos delete ho gayi",
  },
};

const normalizeLocale = (language) => {
  const value = String(language || "")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();
  if (value === "hi" || value.startsWith("hi-")) return "hi-IN";
  if (value === "en-in" || value.startsWith("en-in-")) return "en-IN";
  return "en-US";
};

const normalizeLabel = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase()
    // Keep Unicode letters so Devanagari labels can be matched too.
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");

const areaMaps = (feature) =>
  feature === "palm"
    ? PALM_AREAS
    : feature === "graphology"
      ? GRAPHOLOGY_AREAS
      : feature === "drawing"
        ? DRAWING_AREAS
        : FACE_AREAS;

const areaOrder = (feature) =>
  feature === "palm"
    ? PALM_AREA_ORDER
    : feature === "graphology"
      ? GRAPHOLOGY_AREA_ORDER
      : feature === "drawing"
        ? DRAWING_AREA_ORDER
        : FACE_AREA_ORDER;

// [id, label] pairs in a stable order for the requested locale.
const getAreas = (feature, language) => {
  const map = areaMaps(feature)[normalizeLocale(language)];
  return areaOrder(feature).map((id) => [id, map[id]]);
};

const getAreaLabel = (feature, id, language) =>
  areaMaps(feature)[normalizeLocale(language)][id] || String(id || "");

// Find the stable area id for any label the AI may have returned, in any of
// the supported locales. Returns null for free-form observations.
const findAreaId = (feature, label) => {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  for (const id of areaOrder(feature)) {
    if (normalizeLabel(id) === normalized) return id;
    for (const map of Object.values(areaMaps(feature))) {
      if (normalizeLabel(map[id]) === normalized) return id;
    }
  }
  return null;
};

const getDisclaimer = (language, feature) => {
  const locale = normalizeLocale(language);
  return feature === "graphology"
    ? GRAPHOLOGY_DISCLAIMERS[locale]
    : feature === "drawing"
      ? DRAWING_DISCLAIMERS[locale]
      : DISCLAIMERS[locale];
};

const getCautionPrefix = (language) =>
  CAUTION_PREFIX[normalizeLocale(language)];

const getFeatureLabel = (feature, language) =>
  FEATURE_LABELS[normalizeLocale(language)][
    feature === "palm" || feature === "graphology" || feature === "drawing"
      ? feature
      : "face"
  ];

const getMessage = (key, language) => {
  const locale = normalizeLocale(language);
  return MESSAGES[locale][key] || MESSAGES["en-US"][key] || key;
};

module.exports = {
  normalizeLocale,
  getAreas,
  getAreaLabel,
  findAreaId,
  getDisclaimer,
  getCautionPrefix,
  getFeatureLabel,
  getMessage,
};
