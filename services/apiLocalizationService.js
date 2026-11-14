const {
  localizeHumanDesignChart,
  translateHumanDesignText,
} = require("./humanDesignLocalizationService");

const HINDI_MESSAGES = {
  "Matchmaking API is running": "मैचमेकिंग सेवा चालू है",
  "Server is running": "सर्वर चालू है",
  "Too many requests, please try again later":
    "बहुत अधिक अनुरोध किए गए हैं। कृपया थोड़ी देर बाद फिर कोशिश करें।",
  "Too many attempts, please try again later":
    "बहुत अधिक प्रयास किए गए हैं। कृपया थोड़ी देर बाद फिर कोशिश करें।",
  "Validation failed": "जानकारी की जाँच विफल हुई",
  "A record with that value already exists":
    "इस जानकारी का रिकॉर्ड पहले से मौजूद है",
  "Invalid identifier": "अमान्य पहचान संख्या",
  "Something went wrong": "कुछ गड़बड़ हुई",
  "Authentication required": "लॉग इन करना ज़रूरी है",
  "Profile retrieved": "प्रोफ़ाइल प्राप्त हुई",
  "Profile updated": "प्रोफ़ाइल अपडेट हुई",
  "Photo added": "फ़ोटो जोड़ दी गई",
  "Photo removed": "फ़ोटो हटा दी गई",
  "Primary photo updated": "मुख्य फ़ोटो अपडेट हुई",
  "Account and all associated data deleted":
    "खाता और उससे जुड़ा सारा डेटा हटा दिया गया",
  "Questionnaire created": "प्रश्नावली बनाई गई",
  "Questionnaire retrieved": "प्रश्नावली प्राप्त हुई",
  "Questionnaire updated": "प्रश्नावली अपडेट हुई",
  "Questionnaire not found": "प्रश्नावली नहीं मिली",
  "Horoscope created": "कुंडली बनाई गई",
  "Horoscope retrieved": "कुंडली प्राप्त हुई",
  "Horoscope updated": "कुंडली अपडेट हुई",
  "Horoscope not found": "कुंडली नहीं मिली",
  "Birth charts retrieved": "जन्म-कुंडलियाँ प्राप्त हुईं",
  "Kundli calculated successfully": "कुंडली सफलतापूर्वक बनाई गई",
  "Lal Kitab Varshphal calculated successfully":
    "लाल किताब वर्षफल सफलतापूर्वक बनाया गया",
  "Categories list retrieved successfully":
    "श्रेणियों की सूची प्राप्त हुई",
  "Chat response generated successfully":
    "चैट का जवाब सफलतापूर्वक तैयार हुआ",
  "My Chart retrieved successfully": "मेरा चार्ट प्राप्त हुआ",
  "Chat history retrieved": "चैट इतिहास प्राप्त हुआ",
  "Messages retrieved": "संदेश प्राप्त हुए",
  "Message sent": "संदेश भेजा गया",
  "Sticker sent": "स्टिकर भेजा गया",
  "Media message sent": "मीडिया संदेश भेजा गया",
  "Message deleted for you": "संदेश आपके लिए हटा दिया गया",
  "Message deleted for everyone": "संदेश सभी के लिए हटा दिया गया",
  "Chat deleted for you": "चैट आपके लिए हटा दी गई",
  "Messages marked as read": "संदेश पढ़े गए के रूप में चिह्नित हुए",
  "Compatibility calculated": "अनुकूलता की गणना हुई",
  "Match retrieved": "मैच की जानकारी मिली",
  "Matches retrieved": "मैच प्राप्त हुए",
  "Recommendations retrieved": "सुझाव प्राप्त हुए",
  "Logo direction generated": "लोगो का सुझाव तैयार हुआ",
  "No logo generated yet. Create your first logo direction.":
    "अभी कोई लोगो नहीं बना है। पहले लोगो का सुझाव तैयार करें।",
  "Latest logo direction": "नवीनतम लोगो सुझाव",
  "Logo review ready": "लोगो की समीक्षा तैयार है",
  "Logo reviews retrieved": "लोगो की समीक्षाएँ प्राप्त हुईं",
  "Vastu report generated": "वास्तु रिपोर्ट तैयार हुई",
  "Numerology profile saved": "अंक-ज्योतिष प्रोफ़ाइल सहेजी गई",
  "Numerology profile retrieved": "अंक-ज्योतिष प्रोफ़ाइल प्राप्त हुई",
  "Answer generated": "जवाब तैयार हुआ",
  "Astro chat history retrieved": "ज्योतिष चैट इतिहास प्राप्त हुआ",
  "Consultation not found": "परामर्श नहीं मिला",
  "Review submitted": "समीक्षा भेजी गई",
  "Removed from queue": "कतार से हटाया गया",
  "Already reviewed": "समीक्षा पहले ही भेजी जा चुकी है",
  "Already ended": "यह पहले ही समाप्त हो चुका है",
  "Astrologer not found": "ज्योतिषी नहीं मिला",
  "Astrologer profile not found": "ज्योतिषी की प्रोफ़ाइल नहीं मिली",
  "Astrologer is currently offline": "ज्योतिषी अभी ऑफ़लाइन हैं",
  "Astrologer is busy. You are in the queue.":
    "ज्योतिषी व्यस्त हैं। आपको कतार में रखा गया है।",
  "Client not found": "क्लाइंट नहीं मिला",
  "Calls are available only after the match request is accepted":
    "कॉल की सुविधा मैच अनुरोध स्वीकार होने के बाद ही उपलब्ध है",
  "This consultation has ended": "यह परामर्श समाप्त हो चुका है",
  "LiveKit is not configured on the server":
    "सर्वर पर LiveKit सेट नहीं है",
  "Invalid matchId": "अमान्य मैच पहचान संख्या",
  "Invalid partnerId": "अमान्य साथी पहचान संख्या",
  "Invalid astrologerId": "अमान्य ज्योतिषी पहचान संख्या",
  "Invalid clientId": "अमान्य क्लाइंट पहचान संख्या",
  "Match not found": "मैच नहीं मिला",
  "Partner not found": "साथी नहीं मिला",
  "You cannot match with yourself": "आप अपना मैच स्वयं से नहीं कर सकते",
  "You cannot consult yourself": "आप स्वयं से परामर्श नहीं कर सकते",
  "Only the sender can delete this message for everyone":
    "यह संदेश सभी के लिए केवल भेजने वाला हटा सकता है",
};

const HINDI_DYNAMIC_MESSAGES = [
  [
    /^Match request (accepted|rejected)$/,
    (match) => `मैच अनुरोध ${match[1] === "accepted" ? "स्वीकार" : "अस्वीकार"} किया गया`,
  ],
];

const HINDI_TEXT_FIELDS = new Set([
  "description",
  "headline",
  "keynote",
  "label",
  "summary",
  "title",
]);

const isHindi = (language) => /^hi(?:-|$)/i.test(language || "");

const localizeApiResponse = (value, language, key = "") => {
  if (!isHindi(language)) return value;
  if (Array.isArray(value)) {
    return value.map((item) => localizeApiResponse(item, language, key));
  }
  if (typeof value === "string") {
    if (key === "message" || key === "error") {
      if (HINDI_MESSAGES[value]) return HINDI_MESSAGES[value];
      for (const [pattern, render] of HINDI_DYNAMIC_MESSAGES) {
        const match = value.match(pattern);
        if (match) return render(match);
      }
    }
    return HINDI_TEXT_FIELDS.has(key)
      ? translateHumanDesignText(value)
      : value;
  }
  if (!value || typeof value !== "object") return value;

  if (
    typeof value.typeLabel === "string" &&
    typeof value.profileLabel === "string"
  ) {
    return localizeHumanDesignChart(value, language);
  }

  if (typeof value.toJSON === "function") {
    return localizeApiResponse(value.toJSON(), language, key);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      localizeApiResponse(childValue, language, childKey),
    ]),
  );
};

module.exports = { isHindi, localizeApiResponse };
