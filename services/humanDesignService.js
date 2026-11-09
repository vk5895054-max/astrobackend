const Astronomy = require("astronomy-engine");
const { getTrueNodeLongitude, getMeanNodeLongitude } = require("./vedicAstrologyService");
const { normalizeTimeOfBirth, getSignFromLongitude } = require("./astrologyService");

// Human Design Rave Mandala constants:
// Gate 41 begins at 02°00'00" Aquarius (302.0° tropical ecliptic longitude).
// Each of the 64 I Ching hexagrams occupies 5.625° (360° / 64), divided into
// 6 lines of 0.9375° (5.625° / 6), 6 colors of 0.15625°, and 6 tones.
const RAVE_MANDALA_START_DEG = 302.0;
const GATE_SPAN = 360 / 64;
const LINE_SPAN = GATE_SPAN / 6;
const COLOR_SPAN = LINE_SPAN / 6;
const TONE_SPAN = COLOR_SPAN / 6;
const BASE_SPAN = TONE_SPAN / 5;
const DESIGN_SOLAR_ARC_DEG = 88.0;

const RAVE_WHEEL_ORDER = [
  41, 19, 13, 49, 30, 55, 37, 63,
  22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35,
  45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64,
  47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5,
  26, 11, 10, 58, 38, 54, 61, 60,
];

const PLANETS_ORDER = [
  { name: "Sun", symbol: "☉", body: null },
  { name: "Earth", symbol: "⊕", body: null },
  { name: "Moon", symbol: "☽", body: "Moon" },
  { name: "North Node", symbol: "☊", body: null },
  { name: "South Node", symbol: "☋", body: null },
  { name: "Mercury", symbol: "☿", body: "Mercury" },
  { name: "Venus", symbol: "♀", body: "Venus" },
  { name: "Mars", symbol: "♂", body: "Mars" },
  { name: "Jupiter", symbol: "♃", body: "Jupiter" },
  { name: "Saturn", symbol: "♄", body: "Saturn" },
  { name: "Uranus", symbol: "♅", body: "Uranus" },
  { name: "Neptune", symbol: "♆", body: "Neptune" },
  { name: "Pluto", symbol: "♇", body: "Pluto" },
];

// 9 BodyGraph Centers matching the app UI and gate layout
const CENTERS_META = [
  {
    name: "Crown",
    displayName: "Crown Center",
    shape: "triangle",
    isMotor: false,
    isAwareness: false,
    gates: [64, 61, 63],
    keywords: ["inspiration", "mental pressure", "confusion"],
    definedDescription: "Consistent capacity to initiate inspiring questions, curiosity, and mental exploration.",
    undefinedDescription: "Open to diverse mental inspiration and questions from others; wise not to hold onto every thought.",
  },
  {
    name: "Ajna",
    displayName: "Ajna Center",
    shape: "inverted_triangle",
    isMotor: false,
    isAwareness: true,
    gates: [47, 24, 4, 17, 11, 43],
    keywords: ["thoughts", "ideas", "insights"],
    definedDescription: "Fixed, reliable way of conceptualizing, processing patterns, and forming intellectual viewpoints.",
    undefinedDescription: "Flexible, open-minded thinker able to view ideas from many perspectives without mental rigidity.",
  },
  {
    name: "Throat",
    displayName: "Throat Center",
    shape: "square",
    isMotor: false,
    isAwareness: false,
    gates: [62, 23, 56, 16, 12, 20, 45, 31, 8, 33, 35],
    keywords: ["communication", "expression", "conversations"],
    definedDescription: "Consistent voice and style of communication and outward manifestation in dialogue and action.",
    undefinedDescription: "Adaptable communicator who mirrors the room; speaks most impactfully when invited or recognized.",
  },
  {
    name: "G",
    displayName: "G Center",
    shape: "diamond",
    isMotor: false,
    isAwareness: false,
    gates: [1, 7, 10, 13, 25, 15, 46, 2],
    keywords: ["direction", "love", "identity"],
    definedDescription: "Steady internal compass for personal identity, direction in life, and how you give and receive love.",
    undefinedDescription: "Chameleon sensitivity to environment and relationships; thriving in places and with people that feel right.",
  },
  {
    name: "Heart/Ego",
    displayName: "Heart/Ego Center",
    shape: "triangle",
    isMotor: true,
    isAwareness: false,
    gates: [21, 51, 26, 40],
    keywords: ["willpower", "vitality", "resistance"],
    definedDescription: "Consistent willpower and commitment drive; thrives when keeping chosen promises on your own terms.",
    undefinedDescription: "Nothing to prove through willpower; healthy detachment from ego competition and over-committing.",
  },
  {
    name: "Spleen",
    displayName: "Spleen Center",
    shape: "left_triangle",
    isMotor: false,
    isAwareness: true,
    gates: [48, 57, 44, 50, 32, 28, 18],
    keywords: ["health", "immunity", "survival"],
    definedDescription: "Built-in spontaneous survival instincts, heightened somatic intuition, and innate sense of well-being.",
    undefinedDescription: "Empathetic barometer for physical and intuitive well-being in others; discerning what truly feels safe.",
  },
  {
    name: "Sacral",
    displayName: "Sacral Center",
    shape: "square",
    isMotor: true,
    isAwareness: false,
    gates: [5, 14, 29, 34, 27, 59, 42, 3, 9],
    keywords: ["life force", "endurance", "work capacity"],
    definedDescription: "Sustainable regenerative vitality and unmistakable gut-response clarity for work, creation, and intimacy.",
    undefinedDescription: "Non-sacral energy designed to guide and orchestrate rather than grind; knowing when enough is enough.",
  },
  {
    name: "Solar Plexus",
    displayName: "Solar Plexus Center",
    shape: "right_triangle",
    isMotor: true,
    isAwareness: true,
    gates: [36, 22, 37, 6, 49, 55, 30],
    keywords: ["emotions", "feelings", "intuition"],
    definedDescription: "Emotional wave cycles that yield deep clarity over time rather than in spontaneous emotional peaks or lows.",
    undefinedDescription: "Emotionally empathic receiver who absorbs and amplifies surrounding moods; clarity arrives in calm waters.",
  },
  {
    name: "Root",
    displayName: "Root Center",
    shape: "square",
    isMotor: true,
    isAwareness: false,
    gates: [53, 60, 52, 54, 19, 38, 39, 58, 41],
    keywords: ["adrenaline", "stress", "drive"],
    definedDescription: "Grounded pulse and personal rhythm for handling pressure, adrenaline, and initiating momentum.",
    undefinedDescription: "Sensitive to external urgency and deadlines; calmest when resisting artificial hurry.",
  },
];

const CENTER_LOOKUP = Object.fromEntries(CENTERS_META.map((center) => [center.name, center]));

const GATE_TO_CENTER = Object.fromEntries(
  CENTERS_META.flatMap((center) => center.gates.map((gate) => [gate, center.name]))
);

// All 64 I Ching Gates in the Rave BodyGraph
const GATES_META = {
  1: { name: "The Gate of Self-Expression", keynote: "Creative individuality and authentic direction", description: "Embodies unique creative fuel that inspires when shared organically." },
  2: { name: "The Gate of the Direction of the Self", keynote: "Receptive alignment and higher knowing", description: "Guides orientation and stewardship of life's magnetic path." },
  3: { name: "The Gate of Ordering", keynote: "Transforming initial chaos into lasting order", description: "Brings mutative pulse and patience to emerging new forms." },
  4: { name: "The Gate of Formulization", keynote: "Logical answers and mental frameworks", description: "Seeks coherent theories and provisional answers to life's puzzles." },
  5: { name: "The Gate of Fixed Patterns", keynote: "Universal rhythm and natural timing", description: "Grounds consistency through daily rituals and attuned patience." },
  6: { name: "The Gate of Friction", keynote: "Emotional intimacy and boundary awareness", description: "Regulates vulnerability, openness, and rapport in close bonds." },
  7: { name: "The Gate of the Role of the Self", keynote: "Democratic leadership and strategic vision", description: "Offers guiding direction through recognized competence and foresight." },
  8: { name: "The Gate of Contribution", keynote: "Distinctive creative presentation", description: "Shares original examples that empower collective creativity." },
  9: { name: "The Gate of Focus", keynote: "Detailed concentration and determination", description: "Channels energy onto meaningful specifics until mastery emerges." },
  10: { name: "The Gate of Behavior of the Self", keynote: "Self-love and authentic conduct", description: "Reflects living faithfully by one's own truth regardless of expectation." },
  11: { name: "The Gate of Ideas", keynote: "Conceptual storytelling and curiosity", description: "Explores peace through boundless reflection, metaphor, and inquiry." },
  12: { name: "The Gate of Caution", keynote: "Articulate social discernment", description: "Speaks with poignant emotional impact when timing and mood align." },
  13: { name: "The Gate of the Listener", keynote: "Empathetic witnessing and shared wisdom", description: "Attracts stories and secrets to preserve meaningful human experience." },
  14: { name: "The Gate of Power Skills", keynote: "Prosperity through dedicated craft", description: "Sustains abundant energy for work that resonates deeply." },
  15: { name: "The Gate of Extremes", keynote: "Expansive humanity and diverse rhythms", description: "Bridges vastly different paces and embraces all walks of life." },
  16: { name: "The Gate of Skills", keynote: "Enthusiastic talent and experimentation", description: "Refines mastery through joyful practice, rehearsal, and shared skill." },
  17: { name: "The Gate of Opinions", keynote: "Pattern-based perspective", description: "Organizes visual and logical detail into forward-looking viewpoints." },
  18: { name: "The Gate of Correction", keynote: "Refining imperfections for collective health", description: "Notices what can be improved so systems function sustainably." },
  19: { name: "The Gate of Wanting", keynote: "Attuned sensitivity to fundamental needs", description: "Picks up on belonging, support, and material/emotional interdependence." },
  20: { name: "The Gate of the Now", keynote: "Present-moment awareness in action", description: "Expresses spontaneity, candor, and direct engagement with what is happening now." },
  21: { name: "The Gate of Control", keynote: "Stewardship over resources and territory", description: "Directs material management effectively when operating within clear autonomy." },
  22: { name: "The Gate of Grace", keynote: "Social charm and emotional depth", description: "Radiates openness and magnetic listening when emotionally balanced." },
  23: { name: "The Gate of Assimilation", keynote: "Distilling insight into clear language", description: "Translates complex breakthroughs into concise, empowering explanations." },
  24: { name: "The Gate of Rationalization", keynote: "Mental contemplation and renewal", description: "Revisits mysteries repeatedly until clarity naturally crystallizes." },
  25: { name: "The Gate of the Spirit of the Self", keynote: "Unconditional love and innocent resilience", description: "Meets unexpected initiations with openhearted presence and courage." },
  26: { name: "The Gate of Accumulation", keynote: "Persuasion, value memory, and enterprise", description: "Understands worth and communicates compelling benefits effortlessly." },
  27: { name: "The Gate of Caring", keynote: "Nurturing protection and responsibility", description: "Sustains vitality to care wisely without neglecting one's own reserves." },
  28: { name: "The Gate of the Game Player", keynote: "Pursuing purpose through worthy struggle", description: "Tests limits and seeks meaning worth enduring risks and effort for." },
  29: { name: "The Gate of Perseverance", keynote: "Wholehearted commitment and devotion", description: "Thrives when saying yes only to experiences that truly invite deep engagement." },
  30: { name: "The Gate of Feelings", keynote: "Passionate desire and experiential depth", description: "Brings intensity, longing, and appreciation for transformative experiences." },
  31: { name: "The Gate of Influence", keynote: "Recognized voice of collective guidance", description: "Articulates emerging trends and future paths when invited to lead." },
  32: { name: "The Gate of Continuity", keynote: "Instinct for enduring value", description: "Evaluates which ventures and bonds can weather real-world change." },
  33: { name: "The Gate of Privacy", keynote: "Sacred retreat and experiential reflection", description: "Integrates life lessons in solitude before sharing timeless takeaways." },
  34: { name: "The Gate of Power", keynote: "Self-sufficient primal vitality", description: "Generates independent stamina that flourishes when channeled responsively." },
  35: { name: "The Gate of Change", keynote: "Adventurous progress and experiential variety", description: "Seeks fresh horizons, emotional breakthroughs, and shared growth." },
  36: { name: "The Gate of Crisis", keynote: "Emotional resilience through uncharted waves", description: "Navigates intensity and turns turbulent turning points into wisdom." },
  37: { name: "The Gate of Friendship", keynote: "Loyal bonds, agreements, and belonging", description: "Builds warmth, mutual fairness, and supportive community." },
  38: { name: "The Gate of the Fighter", keynote: "Tenacious individuality and purposeful stand", description: "Presses against adversity to uphold personal integrity and authentic battle." },
  39: { name: "The Gate of Provocation", keynote: "Catalyzing emotional depth and spirit", description: "Stirs stagnant spaces to reveal who truly resonates." },
  40: { name: "The Gate of Aloneness", keynote: "Restoring balance between work and rest", description: "Requires dedicated personal space to recharge generosity and loyalty." },
  41: { name: "The Gate of Contraction", keynote: "Imaginative desire and new experiential cycles", description: "Plants the seed of focused longing before taking real action." },
  42: { name: "The Gate of Growth", keynote: "Closing cycles cleanly to multiply mastery", description: "Finds fulfillment by seeing experiences through to natural completion." },
  43: { name: "The Gate of Insight", keynote: "Original breakthrough thinking", description: "Receives unique internal downloads best shared when timing invites dialogue." },
  44: { name: "The Gate of Alertness", keynote: "Instinctive pattern recognition in relationships", description: "Senses latent talent, trust dynamics, and echoes from past experience." },
  45: { name: "The Gate of the Gatherer", keynote: "Stewardship, education, and shared abundance", description: "Brings resources, voice, and leadership together for the wider circle." },
  46: { name: "The Gate of Determination of the Self", keynote: "Embodied devotion and serendipity", description: "Trusts physical presence and dedication to attract right place and timing." },
  47: { name: "The Gate of Realization", keynote: "Turning reflection into clear understanding", description: "Finds relief as fragmentary memories weave into coherent meaning." },
  48: { name: "The Gate of Depth", keynote: "Intuitive mastery and practical solutions", description: "Accumulates deep resourcefulness to enrich skills with timeless substance." },
  49: { name: "The Gate of Principles", keynote: "Values-driven sensitivity and loyalty", description: "Shapes relational and communal standards around mutual respect." },
  50: { name: "The Gate of Values", keynote: "Custodian of conscience and nourishing laws", description: "Upholds ethical standards that protect community well-being." },
  51: { name: "The Gate of Shock", keynote: "Awakening courage in bold thresholds", description: "Steps fearlessly into uncharted firsts that spark self-discovery." },
  52: { name: "The Gate of Stillness", keynote: "Grounded composure for sustained focus", description: "Holds calm energy so concentration can mature without agitation." },
  53: { name: "The Gate of Beginnings", keynote: "Cyclical initiation of fresh chapters", description: "Senses when a new developmental cycle is ready to launch." },
  54: { name: "The Gate of Ambition", keynote: "Drive to elevate through dedicated alliances", description: "Transforms material drive into recognized social and spiritual ascent." },
  55: { name: "The Gate of Spirit", keynote: "Creative fullness through emotional waves", description: "Cultivates abundance of feeling and deep artistic/romantic resonance." },
  56: { name: "The Gate of Stimulation", keynote: "Expressive storytelling and perspective sharing", description: "Illuminates concepts through memorable anecdotes and exploration." },
  57: { name: "The Gate of Intuitive Clarity", keynote: "Sharp in-the-moment acoustic intuition", description: "Attunes instinctively to subtle cues for well-being and truth right now." },
  58: { name: "The Gate of Vitality", keynote: "Joyful energy to refine and uplift life", description: "Sustains zest for perfection, improvement, and playful correction." },
  59: { name: "The Gate of Sexuality", keynote: "Magnetic aura dissolving interpersonal barriers", description: "Deepens intimacy, creative fertility, and authentic closeness." },
  60: { name: "The Gate of Acceptance", keynote: "Working creatively within natural limits", description: "Recognizes necessary structure so genuine innovation can land." },
  61: { name: "The Gate of Mystery", keynote: "Inner truth and contemplative stillness", description: "Ponders fundamental questions to uncover authentic inspiration." },
  62: { name: "The Gate of Details", keynote: "Precision in facts, names, and planning", description: "Translates logical insight into clear, actionable organization." },
  63: { name: "The Gate of Doubt", keynote: "Healthy questioning and verification", description: "Tests ideas critically so lasting patterns withstand scrutiny." },
  64: { name: "The Gate of Confusion", keynote: "Vast imaginative synthesis of experience", description: "Embraces rich sensory imagery until understanding ripens organically." },
};

// All 36 BodyGraph Channels
const CHANNELS_META = [
  { id: "1-8", gates: [1, 8], centers: ["G", "Throat"], name: "Channel of Inspiration", isLoveSection: true, description: "Expresses unique creative identity effortlessly into the world by example." },
  { id: "2-14", gates: [2, 14], centers: ["G", "Sacral"], name: "Channel of the Beat", isLoveSection: true, description: "Aligns abundant life-force work directly with inner direction and prosperity." },
  { id: "3-60", gates: [3, 60], centers: ["Sacral", "Root"], name: "Channel of Mutation", isLoveSection: false, description: "Transforms pressure and limitation into enduring, pulse-driven evolution." },
  { id: "4-63", gates: [4, 63], centers: ["Ajna", "Crown"], name: "Channel of Logic", isLoveSection: false, description: "Questions patterns systematically and formulates testable logical answers." },
  { id: "5-15", gates: [5, 15], centers: ["Sacral", "G"], name: "Channel of Rhythm", isLoveSection: true, description: "Finds magnetic flow across diverse rhythms while honoring natural timing." },
  { id: "6-59", gates: [6, 59], centers: ["Solar Plexus", "Sacral"], name: "Channel of Intimacy", isLoveSection: true, description: "Deep aura-level bonding uniting emotional discernment and passionate closeness." },
  { id: "7-31", gates: [7, 31], centers: ["G", "Throat"], name: "Channel of the Alpha", isLoveSection: true, description: "Provides recognized, forward-seeing leadership rooted in trusted direction." },
  { id: "9-52", gates: [9, 52], centers: ["Sacral", "Root"], name: "Channel of Concentration", isLoveSection: false, description: "Anchors sustained physical stillness and deep detailed focus." },
  { id: "10-20", gates: [10, 20], centers: ["G", "Throat"], name: "Channel of Awakening", isLoveSection: true, description: "Demonstrates authentic self-expression lived naturally in the present moment." },
  { id: "10-34", gates: [10, 34], centers: ["G", "Sacral"], name: "Channel of Exploration", isLoveSection: true, description: "Empowers self-love and independent exploration guided by gut clarity." },
  { id: "10-57", gates: [10, 57], centers: ["G", "Spleen"], name: "Channel of Perfected Form", isLoveSection: true, description: "Guides authentic survival and beauty through crisp intuitive awareness." },
  { id: "11-56", gates: [11, 56], centers: ["Ajna", "Throat"], name: "Channel of Curiosity", isLoveSection: false, description: "Weaves vivid concepts and searching wonder into engaging stories." },
  { id: "12-22", gates: [12, 22], centers: ["Throat", "Solar Plexus"], name: "Channel of Openness", isLoveSection: true, description: "Expresses soulful emotion and grace when timing and mood align." },
  { id: "13-33", gates: [13, 33], centers: ["G", "Throat"], name: "Channel of the Prodigal", isLoveSection: true, description: "Distills listened memories and lived wisdom into timeless stories." },
  { id: "16-48", gates: [16, 48], centers: ["Throat", "Spleen"], name: "Channel of Wavelength", isLoveSection: false, description: "Refines talent and deep intuitive craft through dedication and rehearsal." },
  { id: "17-62", gates: [17, 62], centers: ["Ajna", "Throat"], name: "Channel of Acceptance", isLoveSection: false, description: "Turns visual patterns and opinions into structured, articulate plans." },
  { id: "18-58", gates: [18, 58], centers: ["Spleen", "Root"], name: "Channel of Judgment", isLoveSection: false, description: "Energizes joyful mastery by spotting and refining flaws constructively." },
  { id: "19-49", gates: [19, 49], centers: ["Root", "Solar Plexus"], name: "Channel of Synthesis", isLoveSection: true, description: "Attunes deeply to shared needs, sensitivity, and loyal mutual support." },
  { id: "20-34", gates: [20, 34], centers: ["Throat", "Sacral"], name: "Channel of Keeping Busy", isLoveSection: false, description: "High-powered charismatic energy linking Sacral vitality directly to Throat manifestation." },
  { id: "20-57", gates: [20, 57], centers: ["Throat", "Spleen"], name: "Channel of the Brainwave", isLoveSection: false, description: "Instant intuitive clarity expressed spontaneously in the living moment." },
  { id: "21-45", gates: [21, 45], centers: ["Heart/Ego", "Throat"], name: "Channel of the Money Line", isLoveSection: false, description: "Material stewardship and executive voice overseeing shared prosperity." },
  { id: "23-43", gates: [23, 43], centers: ["Throat", "Ajna"], name: "Channel of Structuring", isLoveSection: false, description: "Transforms unconventional individual insight into clear, innovative expression." },
  { id: "24-61", gates: [24, 61], centers: ["Ajna", "Crown"], name: "Channel of Awareness", isLoveSection: false, description: "Investigates life's mysteries with quiet inspiration until insights click." },
  { id: "25-51", gates: [25, 51], centers: ["G", "Heart/Ego"], name: "Channel of Initiation", isLoveSection: true, description: "Fearless spiritual courage that opens the heart through bold leaps." },
  { id: "26-44", gates: [26, 44], centers: ["Heart/Ego", "Spleen"], name: "Channel of Surrender", isLoveSection: false, description: "Persuasive material savvy paired with sharp instinct for human patterns." },
  { id: "27-50", gates: [27, 50], centers: ["Sacral", "Spleen"], name: "Channel of Preservation", isLoveSection: true, description: "Protects, nourishes, and sustains core values and loved ones with endurance." },
  { id: "28-38", gates: [28, 38], centers: ["Spleen", "Root"], name: "Channel of Struggle", isLoveSection: false, description: "Stubborn, individual resilience determined to wrestle true meaning from life." },
  { id: "29-46", gates: [29, 46], centers: ["Sacral", "G"], name: "Channel of Discovery", isLoveSection: true, description: "Succeeds through embodied commitment to absorbing experiences step by step." },
  { id: "30-41", gates: [30, 41], centers: ["Solar Plexus", "Root"], name: "Channel of Recognition", isLoveSection: true, description: "Rich imaginative desire sparking experiential journeys and emotional growth." },
  { id: "32-54", gates: [32, 54], centers: ["Spleen", "Root"], name: "Channel of Transformation", isLoveSection: false, description: "Instinctive drive converting ambition into lasting success through right allies." },
  { id: "34-57", gates: [34, 57], centers: ["Sacral", "Spleen"], name: "Channel of Power", isLoveSection: false, description: "Independent life force guided cleanly by moment-to-moment survival instinct." },
  { id: "35-36", gates: [35, 36], centers: ["Throat", "Solar Plexus"], name: "Channel of Transitoriness", isLoveSection: true, description: "Experiential wisdom born from emotional curiosity, empathy, and shared change." },
  { id: "37-40", gates: [37, 40], centers: ["Solar Plexus", "Heart/Ego"], name: "Channel of Community", isLoveSection: true, description: "Warm loyalty, family bargains, and mutual care balanced by healthy rest." },
  { id: "39-55", gates: [39, 55], centers: ["Root", "Solar Plexus"], name: "Channel of Emoting", isLoveSection: true, description: "Catalyzes creative spirit, romantic mood, and deep musical/emotional resonance." },
  { id: "42-53", gates: [42, 53], centers: ["Sacral", "Root"], name: "Channel of Maturation", isLoveSection: false, description: "Balanced evolutionary rhythm carrying ventures steadily from start to finish." },
  { id: "47-64", gates: [47, 64], centers: ["Ajna", "Crown"], name: "Channel of Abstract Thinking", isLoveSection: false, description: "Weaves vivid memories and mental imagery into meaningful realization over time." },
];

const PROFILES_META = {
  "1/3": {
    name: "Investigator Martyr",
    description: "Learns deeply through thorough research (1) combined with fearless trial-and-error experience (3).",
  },
  "1/4": {
    name: "Investigator Opportunist",
    description: "Builds a rock-solid foundation of knowledge (1) shared naturally within trusted networks (4).",
  },
  "2/4": {
    name: "Hermit Opportunist",
    description: "Balances natural solitary genius (2) with warm, impactful community opportunities (4).",
  },
  "2/5": {
    name: "Hermit Heretic",
    description: "Carries effortless gifts noticed by others while called to deliver practical solutions (5).",
  },
  "3/5": {
    name: "Martyr Heretic",
    description: "Discovers resilient wisdom through hands-on experimentation (3) and shares pragmatic fixes (5).",
  },
  "3/6": {
    name: "Martyr Role Model",
    description: "Moves from vibrant experimentation through a reflective plateau into embodied authentic wisdom (6).",
  },
  "4/6": {
    name: "Opportunist Role Model",
    description: "Nurtures deep relational trust (4) maturing into calm, objective example-setting leadership (6).",
  },
  "4/1": {
    name: "Opportunist Investigator",
    description: "Walks a rare fixed path blending warm friendliness (4) with deeply grounded personal research (1).",
  },
  "5/1": {
    name: "Heretic Investigator",
    description: "Called outward to solve universal problems (5) backed by unshakeable practical research (1).",
  },
  "5/2": {
    name: "Heretic Hermit",
    description: "Projects natural problem-solving magnetism while thriving best with dedicated recharge time (2).",
  },
  "6/2": {
    name: "Role Model Hermit",
    description: "Grows toward authentic, admired poise (6) nurtured in peaceful personal retreats (2).",
  },
  "6/3": {
    name: "Role Model Martyr",
    description: "Lives an enduring journey of adaptation, experimentation, and inspiring real-world integrity (6).",
  },
};

const ENVIRONMENTS_META = {
  1: { name: "Caves", polarity: "Selective / Blending", description: "Thrives in cozy, enclosed spaces with a clear view of entrances so your nervous system stays relaxed." },
  2: { name: "Markets", polarity: "Internal / External", description: "Energized by vibrant exchanges of goods, skills, and curated niches where people gather purposefully." },
  3: { name: "Kitchens", polarity: "Wet / Dry", description: "Flourishes in warm, alchemical spaces full of active creation, transformation, and nourishing craft." },
  4: { name: "Mountains", polarity: "Active / Passive", description: "Gains clarity from elevated vantage points, clean air, and stepping back to see the wider horizon." },
  5: { name: "Valleys", polarity: "Narrow / Wide", description: "Grounded in accessible, acoustic hubs along natural crossroads where rich conversations flow." },
  6: { name: "Shores", polarity: "Natural / Artificial", description: "Feels alive at boundaries and transitions where distinct worlds meet side by side." },
};

const LOVE_BY_TYPE = {
  manifestingGenerator: {
    type: "Manifesting Generator",
    headline: "Vibrant, multi-passionate love fueled by honest sacral response",
    summary: "You bring electric vitality, fast momentum, and playful curiosity into love. Clear communication before acting and partners who give you space to explore your multiple passions unlock lasting harmony.",
    strengths: [
      "Warm, magnetic enthusiasm that keeps partnerships lively and dynamic",
      "Fast intuition when checking in with your gut yes/no before committing",
      "Natural ability to adapt and handle life's practical adventures together",
    ],
    challenges: [
      "Committing quickly out of excitement before waiting for full gut response",
      "Skipping conversation/informing when abruptly pivoting plans",
      "Feeling frustrated or angry when held back in slow-moving dynamics",
    ],
    compatibleDynamics: [
      "Partners who communicate directly and respect your independence and pace",
      "Relationships with room for spontaneity, honesty, and shared projects",
    ],
  },
  generator: {
    type: "Generator",
    headline: "Steady, deeply devoted love rooted in wholehearted presence",
    summary: "Your aura is open and enveloping. When you enter relationships out of authentic sacral response rather than obligation, you radiate warmth, steadiness, and deep satisfaction.",
    strengths: [
      "Deep, regenerative devotion and sustained presence with loved ones",
      "Warm magnetizing aura that invites honesty and comfort",
      "Natural gift for building fulfilling everyday rhythms together",
    ],
    challenges: [
      "Saying yes to keep the peace even when your gut says no",
      "Remaining in drained routines instead of honoring what genuinely lights you up",
    ],
    compatibleDynamics: [
      "Partners who ask open-ended yes/no questions and appreciate your steady warmth",
      "Mutual appreciation for building enjoyable day-to-day rituals",
    ],
  },
  manifestor: {
    type: "Manifestor",
    headline: "Bold, autonomous love deepened by transparent informing",
    summary: "You love intensely and value freedom deeply. When you share your intentions early with those you care about, resistance dissolves and partners happily support your bold initiatives.",
    strengths: [
      "Fierce loyalty and protective initiative for the people you choose",
      "Refreshing honesty and natural independence within partnership",
      "Catalytic presence that inspires growth and courage in a partner",
    ],
    challenges: [
      "Acting without informing, leaving partners feeling shut out",
      "Bottling anger when feeling controlled or micromanaged",
    ],
    compatibleDynamics: [
      "Respectful autonomy paired with simple, proactive transparency",
      "Calm space to rest between creative bursts without guilt",
    ],
  },
  projector: {
    type: "Projector",
    headline: "Insightful, soul-seeing love anchored in deep recognition",
    summary: "You notice what makes people tick at the deepest level. Love flourishes effortlessly with a partner who genuinely sees, values, and invites your perceptive wisdom.",
    strengths: [
      "Extraordinary empathy and razor-sharp understanding of a partner's inner world",
      "Focused one-on-one attentiveness that makes loved ones feel deeply seen",
      "Wise guidance that helps relationships evolve gracefully",
    ],
    challenges: [
      "Over-giving energy to prove worth or offering unsolicited advice",
      "Absorbing a partner's emotional/sacral momentum past your own rest limits",
    ],
    compatibleDynamics: [
      "Consistent recognition, patience, and dedicated rest together and apart",
      "Quality one-on-one dialogue where both perspectives feel genuinely invited",
    ],
  },
  reflector: {
    type: "Reflector",
    headline: "Sensitive, soulful love illuminated by calm space and timing",
    summary: "Like a clear mirror of the relationship itself, you sense every subtle nuance of trust and environment. Taking your lunar time for major commitments brings profound peace.",
    strengths: [
      "Rare clarity about the emotional health and authenticity of your shared space",
      "Delightful, gentle adaptability and appreciation for small surprises",
      "Wise objectivity when not rushed into quick decisions",
    ],
    challenges: [
      "Carrying a partner's temporary moods or stress as though they are permanently yours",
      "Feeling pressured into big relationship milestones without a full month to reflect",
    ],
    compatibleDynamics: [
      "Serene home surroundings and unhurried emotional pacing",
      "Supportive companions who give you room to breathe and decompress daily",
    ],
  },
};

const pad2 = (value) => String(value).padStart(2, "0");

const computeBirthInstant = (birthDetails = {}) => {
  const dob = birthDetails.dateOfBirth instanceof Date
    ? birthDetails.dateOfBirth
    : new Date(birthDetails.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const normalized = normalizeTimeOfBirth(birthDetails.timeOfBirth) || "12:00";
  const [hh, mm] = normalized.split(":").map(Number);
  const tzOffsetMin = Number.isFinite(Number(birthDetails.timeZoneOffsetMinutes))
    ? Number(birthDetails.timeZoneOffsetMinutes)
    : 0;

  const localMs = Date.UTC(
    dob.getUTCFullYear(),
    dob.getUTCMonth(),
    dob.getUTCDate(),
    hh,
    mm
  );
  return new Date(localMs - tzOffsetMin * 60 * 1000);
};

// Solves the exact unconscious (Design) UTC instant when tropical Sun longitude
// was 88.0° prior to the natal Sun longitude (~88-89 days before birth).
const findDesignInstant = (personalityInstant) => {
  const natalSunLon = Astronomy.SunPosition(personalityInstant).elon;
  const targetSunLon = ((natalSunLon - DESIGN_SOLAR_ARC_DEG) % 360 + 360) % 360;

  const DAY_MS = 24 * 60 * 60 * 1000;
  let lo = personalityInstant.getTime() - 94 * DAY_MS;
  let hi = personalityInstant.getTime() - 82 * DAY_MS;

  for (let i = 0; i < 55; i += 1) {
    const mid = (lo + hi) / 2;
    const sunMid = Astronomy.SunPosition(new Date(mid)).elon;
    const signedDiff = ((targetSunLon - sunMid + 540) % 360) - 180;
    if (signedDiff > 0) lo = mid;
    else hi = mid;
  }

  return new Date((lo + hi) / 2);
};

const longitudeToGateLine = (tropicalLongitude) => {
  const rel = ((tropicalLongitude - RAVE_MANDALA_START_DEG) % 360 + 360) % 360;
  const gateIndex = Math.min(63, Math.floor(rel / GATE_SPAN));
  const withinGate = rel - gateIndex * GATE_SPAN;
  const line = Math.min(6, Math.floor(withinGate / LINE_SPAN) + 1);
  const withinLine = withinGate - (line - 1) * LINE_SPAN;
  const color = Math.min(6, Math.floor(withinLine / COLOR_SPAN) + 1);
  const withinColor = withinLine - (color - 1) * COLOR_SPAN;
  const tone = Math.min(6, Math.floor(withinColor / TONE_SPAN) + 1);
  const withinTone = withinColor - (tone - 1) * TONE_SPAN;
  const base = Math.min(5, Math.floor(withinTone / BASE_SPAN) + 1);
  const gate = RAVE_WHEEL_ORDER[gateIndex];

  return {
    gate,
    line,
    color,
    tone,
    base,
    gateLine: `${gate}.${line}`,
  };
};

const getGeocentricActivationsAt = (utcDate) => {
  const sunLon = Astronomy.SunPosition(utcDate).elon;
  const earthLon = (sunLon + 180) % 360;
  const trueNode = getTrueNodeLongitude(utcDate);
  const northNodeLon = Number.isFinite(trueNode) ? trueNode : getMeanNodeLongitude(utcDate);
  const southNodeLon = (northNodeLon + 180) % 360;

  return PLANETS_ORDER.map(({ name, symbol, body }) => {
    let lon;
    if (name === "Sun") lon = sunLon;
    else if (name === "Earth") lon = earthLon;
    else if (name === "North Node") lon = northNodeLon;
    else if (name === "South Node") lon = southNodeLon;
    else lon = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[body], utcDate, true)).elon;

    const mapped = longitudeToGateLine(lon);
    const gateMeta = GATES_META[mapped.gate] || {};
    return {
      planet: name,
      symbol,
      gate: mapped.gate,
      line: mapped.line,
      color: mapped.color,
      tone: mapped.tone,
      base: mapped.base,
      gateLine: mapped.gateLine,
      longitude: Number(lon.toFixed(4)),
      sign: getSignFromLongitude(lon),
      center: GATE_TO_CENTER[mapped.gate] || "",
      gateName: gateMeta.name || `Gate ${mapped.gate}`,
    };
  });
};

const combineActivationSource = (hasPersonality, hasDesign) => {
  if (hasPersonality && hasDesign) return "both";
  if (hasPersonality) return "personality";
  return "design";
};

// Breadth-first search from any center in startCenters along defined channel edges.
const computeConnectedGroups = (definedChannels) => {
  const adj = new Map();
  for (const ch of definedChannels) {
    const [cA, cB] = ch.centers;
    if (!adj.has(cA)) adj.set(cA, new Set());
    if (!adj.has(cB)) adj.set(cB, new Set());
    adj.get(cA).add(cB);
    adj.get(cB).add(cA);
  }
  const visited = new Set();
  const components = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const comp = new Set();
    const queue = [node];
    visited.add(node);
    while (queue.length > 0) {
      const curr = queue.shift();
      comp.add(curr);
      for (const next of adj.get(curr) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return { adj, components };
};

const isReachable = (adj, source, target) => {
  if (!adj.has(source)) return false;
  if (source === target) return true;
  const visited = new Set([source]);
  const queue = [source];
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const next of adj.get(curr) || []) {
      if (next === target) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
};

const resolveTypeAndGuidance = (definedCentersSet, adj) => {
  if (definedCentersSet.size === 0) {
    return {
      type: "reflector",
      typeLabel: "Reflector",
      typeDescription: "All nine centers are open, making you a deeply perceptive mirror of your surroundings and the lunar cycle.",
      strategy: "Wait a Lunar Cycle",
      signature: "Surprise",
      notSelfTheme: "Disappointment",
      notSelfDescription: "Appears when rushing big choices without taking a full 28-day lunar rhythm to sense clarity.",
    };
  }

  const sacralDefined = definedCentersSet.has("Sacral");
  const motorToThroat = ["Sacral", "Heart/Ego", "Solar Plexus", "Root"].some((motor) =>
    isReachable(adj, motor, "Throat")
  );

  if (sacralDefined && motorToThroat) {
    return {
      type: "manifestingGenerator",
      typeLabel: "Manifesting Generator",
      typeDescription: "Multi-passionate builder combining endless Sacral endurance with fast motor-to-Throat manifestation speed.",
      strategy: "To Respond & Inform",
      signature: "Satisfaction & Peace",
      notSelfTheme: "Frustration & Anger",
      notSelfDescription: "Signals pushing prematurely before waiting for a clear gut response or skipping informing others.",
    };
  }

  if (sacralDefined) {
    return {
      type: "generator",
      typeLabel: "Generator",
      typeDescription: "Radiant life-force creator built to magnetize opportunities and thrive in deeply satisfying work.",
      strategy: "To Respond",
      signature: "Satisfaction",
      notSelfTheme: "Frustration",
      notSelfDescription: "Surfaces when forcing outcomes from the mind rather than following unmistakable Sacral gut excitement.",
    };
  }

  if (motorToThroat) {
    return {
      type: "manifestor",
      typeLabel: "Manifestor",
      typeDescription: "Independent initiator wired to spark new movements, set directions in motion, and inspire through clear informing.",
      strategy: "To Inform",
      signature: "Peace",
      notSelfTheme: "Anger",
      notSelfDescription: "Arises when facing resistance after acting without letting key stakeholders know first.",
    };
  }

  return {
    type: "projector",
    typeLabel: "Projector",
    typeDescription: "Perceptive guide with penetrating focus designed to see systems and people clearly and lead when invited.",
    strategy: "Wait for the Invitation",
    signature: "Success",
    notSelfTheme: "Bitterness",
    notSelfDescription: "Appears when offering guidance where your wisdom hasn't yet been genuinely recognized and invited.",
  };
};

const resolveAuthority = (definedCentersSet, adj, type) => {
  if (type === "reflector") {
    return {
      authority: "Lunar",
      description: "Wait a complete ~28-day lunar cycle to let shifting transits reveal a steady decision.",
    };
  }
  if (definedCentersSet.has("Solar Plexus")) {
    return {
      authority: "Emotional",
      description: "Sleep on key choices and let your emotional wave rise and settle; there is no truth in the immediate now.",
    };
  }
  if (definedCentersSet.has("Sacral")) {
    return {
      authority: "Sacral",
      description: "Listen to your immediate visceral gut sounds and pull ('uh-huh' vs 'uhn-uhn') in response to real prompts.",
    };
  }
  if (definedCentersSet.has("Spleen")) {
    return {
      authority: "Splenic",
      description: "Honor quiet, instant in-the-moment intuitive nudges and physical instincts that whisper once in the now.",
    };
  }
  if (definedCentersSet.has("Heart/Ego")) {
    const isManifested = isReachable(adj, "Heart/Ego", "Throat");
    return {
      authority: isManifested ? "Ego Manifested" : "Ego Projected",
      description: "Commit only when your genuine heart willpower is in it and the exchange honors your integrity.",
    };
  }
  if (definedCentersSet.has("G")) {
    return {
      authority: "Self-Projected",
      description: "Talk choices aloud with trusted listeners and hear what rings authentically true from your own voice.",
    };
  }
  return {
    authority: "Mental (Sounding Board)",
    description: "Discuss decisions across multiple calm spaces with trusted sounding boards rather than rushing under pressure.",
  };
};

const resolveDefinition = (components) => {
  const count = components.length;
  if (count === 0) return { label: "No Definition", splitCount: 0, description: "Reflective openness with no fixed center connections." };
  if (count === 1) return { label: "Single Definition", splitCount: 1, description: "All defined centers link in one unified energy flow." };
  if (count === 2) return { label: "Split Definition", splitCount: 2, description: "Two distinct defined areas bridged naturally through relationships and daily interactions." };
  if (count === 3) return { label: "Triple Split Definition", splitCount: 3, description: "Three independent centers of strength that benefit from diverse public environments to harmonize smoothly." };
  return { label: "Quadruple Split Definition", splitCount: count, description: "Four self-contained islands of definition gaining steady integration through time and varied company." };
};

const resolveIncarnationCross = (profileCode, pSun, pEarth, dSun, dEarth) => {
  const firstLine = Number(String(profileCode).split("/")[0]);
  const secondLine = Number(String(profileCode).split("/")[1]);
  let angle = "Right Angle";
  if (firstLine === 4 && secondLine === 1) angle = "Juxtaposition";
  else if (firstLine >= 5) angle = "Left Angle";

  const gateTitle = (GATES_META[pSun.gate]?.name || `Gate ${pSun.gate}`).replace(/^The Gate of (the )?/i, "");
  return {
    angle,
    name: `${angle} Cross of ${gateTitle}`,
    gates: [pSun.gate, pEarth.gate, dSun.gate, dEarth.gate],
    summary: `Sun ${pSun.gateLine} / Earth ${pEarth.gateLine} (Personality) & Sun ${dSun.gateLine} / Earth ${dEarth.gateLine} (Design)`,
  };
};

/**
 * Calculate a complete Human Design ("My Chart") report matching all 5 tabs:
 * BodyGraph, About, Centers, Gates, and Channels (+ Love section).
 */
const calculateHumanDesignChart = (birthDetails = {}) => {
  const personalityInstant = computeBirthInstant(birthDetails);
  if (!personalityInstant) {
    throw new Error("Valid dateOfBirth is required to calculate My Chart");
  }

  const designInstant = findDesignInstant(personalityInstant);
  const personality = getGeocentricActivationsAt(personalityInstant);
  const design = getGeocentricActivationsAt(designInstant);

  // Aggregate active gates across both columns
  const gateMap = new Map();
  for (const row of personality) {
    if (!gateMap.has(row.gate)) {
      gateMap.set(row.gate, { number: row.gate, personalityLines: [], designLines: [], planets: [] });
    }
    const entry = gateMap.get(row.gate);
    entry.personalityLines.push({ planet: row.planet, line: row.line, gateLine: row.gateLine, activation: "personality" });
    entry.planets.push(`P-${row.planet}`);
  }
  for (const row of design) {
    if (!gateMap.has(row.gate)) {
      gateMap.set(row.gate, { number: row.gate, personalityLines: [], designLines: [], planets: [] });
    }
    const entry = gateMap.get(row.gate);
    entry.designLines.push({ planet: row.planet, line: row.line, gateLine: row.gateLine, activation: "design" });
    entry.planets.push(`D-${row.planet}`);
  }

  const gates = [...gateMap.values()]
    .sort((a, b) => a.number - b.number)
    .map((entry) => {
      const hasP = entry.personalityLines.length > 0;
      const hasD = entry.designLines.length > 0;
      const activation = combineActivationSource(hasP, hasD);
      const meta = GATES_META[entry.number] || {};
      const lines = [...entry.designLines, ...entry.personalityLines];
      return {
        number: entry.number,
        label: `Gate ${entry.number}`,
        name: meta.name || `Gate ${entry.number}`,
        keynote: meta.keynote || "",
        description: meta.description || "",
        center: GATE_TO_CENTER[entry.number] || "",
        activation,
        colorTheme: activation === "both" ? "both" : activation === "personality" ? "blue" : "pink",
        lines: lines.map((l) => l.line),
        activations: lines,
        planets: entry.planets,
      };
    });

  const activeGateLookup = new Map(gates.map((g) => [g.number, g]));

  // Defined channels
  const channels = CHANNELS_META.filter(
    (ch) => activeGateLookup.has(ch.gates[0]) && activeGateLookup.has(ch.gates[1])
  ).map((ch) => {
    const gA = activeGateLookup.get(ch.gates[0]);
    const gB = activeGateLookup.get(ch.gates[1]);
    const hasP = gA.activation !== "design" || gB.activation !== "design";
    const hasD = gA.activation !== "personality" || gB.activation !== "personality";
    const activation = combineActivationSource(hasP, hasD);
    return {
      id: ch.id,
      title: `Channel ${ch.id}`,
      name: ch.name,
      gates: ch.gates,
      centers: ch.centers,
      activation,
      isLoveSection: Boolean(ch.isLoveSection),
      description: ch.description,
    };
  });

  const { adj, components } = computeConnectedGroups(channels);
  const definedCentersSet = new Set(channels.flatMap((ch) => ch.centers));

  const centers = CENTERS_META.map((meta) => {
    const defined = definedCentersSet.has(meta.name);
    const activeGates = meta.gates.filter((g) => activeGateLookup.has(g));
    return {
      name: meta.name,
      displayName: meta.displayName,
      shape: meta.shape,
      defined,
      statusLabel: defined ? "DEFINED" : "UNDEFINED",
      keywords: meta.keywords,
      keywordsText: meta.keywords.join(", "),
      gates: meta.gates,
      activeGates,
      description: defined ? meta.definedDescription : meta.undefinedDescription,
    };
  });

  const typeInfo = resolveTypeAndGuidance(definedCentersSet, adj);
  const authorityInfo = resolveAuthority(definedCentersSet, adj, typeInfo.type);
  const definitionInfo = resolveDefinition(components);

  const pSun = personality[0];
  const pEarth = personality[1];
  const dSun = design[0];
  const dEarth = design[1];
  const dNorthNode = design[3];

  const profileCode = `${pSun.line}/${dSun.line}`;
  const profileMeta = PROFILES_META[profileCode] || {
    name: `${pSun.line}-${dSun.line} Profile`,
    description: `Conscious line ${pSun.line} harmonizing with unconscious line ${dSun.line}.`,
  };
  const profileLabel = `${pSun.line}-${dSun.line} ${profileMeta.name}`;

  const envMeta = ENVIRONMENTS_META[dNorthNode.color] || ENVIRONMENTS_META[1];
  const envPolarity = dNorthNode.tone <= 3 ? envMeta.polarity.split("/")[0].trim() : envMeta.polarity.split("/")[1].trim();
  const environment = {
    name: envMeta.name,
    polarity: envPolarity,
    label: `${envMeta.name} (${envPolarity})`,
    color: dNorthNode.color,
    tone: dNorthNode.tone,
    description: envMeta.description,
  };

  const incarnationCross = resolveIncarnationCross(profileCode, pSun, pEarth, dSun, dEarth);

  const loveTypeMeta = LOVE_BY_TYPE[typeInfo.type];
  const activeLoveChannels = channels.filter((c) => c.isLoveSection);
  const activeLoveGates = gates.filter((g) =>
    ["G", "Solar Plexus"].includes(g.center) || [59, 6, 37, 40, 27, 50].includes(g.number)
  );
  const love = {
    badge: "LOVE",
    title: "Love for Type",
    type: typeInfo.typeLabel,
    ...loveTypeMeta,
    activeLoveChannels: activeLoveChannels.map((c) => ({ id: c.id, title: c.title, name: c.name })),
    activeLoveGates: activeLoveGates.map((g) => ({ number: g.number, label: g.label, name: g.name })),
  };

  const about = {
    yourType: {
      key: typeInfo.type,
      label: typeInfo.typeLabel,
      subtitle: "Your Type",
      description: typeInfo.typeDescription,
      strategy: typeInfo.strategy,
      signature: typeInfo.signature,
      notSelfTheme: typeInfo.notSelfTheme,
    },
    profile: {
      code: profileCode,
      name: profileMeta.name,
      label: profileLabel,
      consciousLine: pSun.line,
      unconsciousLine: dSun.line,
      description: profileMeta.description,
    },
    authorityAndStrategy: {
      authority: authorityInfo.authority,
      strategy: typeInfo.strategy,
      label: authorityInfo.authority,
      description: authorityInfo.description,
    },
    notSelfTheme: {
      label: typeInfo.notSelfTheme,
      description: typeInfo.notSelfDescription,
    },
    environment,
    definition: definitionInfo,
    signature: {
      label: typeInfo.signature,
      description: `Experiencing ${typeInfo.signature} indicates you are aligned with your strategy and inner authority.`,
    },
    incarnationCross,
  };

  const birthDateObj = birthDetails.dateOfBirth instanceof Date
    ? birthDetails.dateOfBirth
    : new Date(birthDetails.dateOfBirth);

  return {
    name: String(birthDetails.name || "User").trim(),
    birthDetails: {
      dateOfBirth: `${birthDateObj.getUTCFullYear()}-${pad2(birthDateObj.getUTCMonth() + 1)}-${pad2(birthDateObj.getUTCDate())}`,
      timeOfBirth: normalizeTimeOfBirth(birthDetails.timeOfBirth) || "12:00",
      place: String(birthDetails.place || birthDetails.placeOfBirth || "").trim(),
      latitude: Number.isFinite(Number(birthDetails.latitude)) ? Number(birthDetails.latitude) : null,
      longitude: Number.isFinite(Number(birthDetails.longitude)) ? Number(birthDetails.longitude) : null,
      timeZoneOffsetMinutes: Number.isFinite(Number(birthDetails.timeZoneOffsetMinutes))
        ? Number(birthDetails.timeZoneOffsetMinutes)
        : 0,
      birthInstant: personalityInstant.toISOString(),
      designInstant: designInstant.toISOString(),
    },
    type: typeInfo.type,
    typeLabel: typeInfo.typeLabel,
    profile: profileCode,
    profileLabel,
    authority: authorityInfo.authority,
    strategy: typeInfo.strategy,
    signature: typeInfo.signature,
    notSelfTheme: typeInfo.notSelfTheme,
    definition: definitionInfo.label,
    environment,
    incarnationCross,
    centers,
    gates,
    channels,
    love,
    personality,
    design,
    about,
    bodyGraph: {
      design,
      personality,
      centers,
      channels,
      activeGates: gates.map((g) => ({
        number: g.number,
        name: g.name,
        center: g.center,
        activation: g.activation,
        colorTheme: g.colorTheme,
      })),
    },
  };
};

// Compact summary embedded inside Astrologer Features, Kundli AI, Kundli Milan,
// and astrologer consultation views so MyChart info stays visible everywhere.
const summarizeHumanDesignChart = (chart) => {
  if (!chart || typeof chart !== "object") return null;
  const plain = typeof chart.toObject === "function" ? chart.toObject() : chart;
  const definedCenters = Array.isArray(plain.centers)
    ? plain.centers.filter((c) => c.defined).map((c) => c.displayName || `${c.name} Center`)
    : [];
  return {
    type: plain.type,
    typeLabel: plain.typeLabel || plain.about?.yourType?.label || plain.type,
    profile: plain.profile,
    profileLabel: plain.profileLabel || plain.about?.profile?.label || plain.profile,
    authority: plain.authority,
    strategy: plain.strategy,
    signature: plain.signature || plain.about?.signature?.label || "",
    notSelfTheme: plain.notSelfTheme,
    definition: plain.definition || plain.about?.definition?.label || "",
    environment: plain.environment?.name ? plain.environment : plain.about?.environment || null,
    incarnationCross: plain.incarnationCross || plain.about?.incarnationCross || null,
    definedCenters,
    undefinedCenterCount: 9 - definedCenters.length,
    definedChannels: Array.isArray(plain.channels)
      ? plain.channels.map((ch) => ({ id: ch.id, title: ch.title || `Channel ${ch.id}`, name: ch.name }))
      : [],
    activeGateCount: Array.isArray(plain.gates) ? plain.gates.length : 0,
    loveForType: plain.love?.type ? { title: plain.love.title || "Love for Type", type: plain.love.type, headline: plain.love.headline } : null,
  };
};

module.exports = {
  RAVE_MANDALA_START_DEG,
  RAVE_WHEEL_ORDER,
  PLANETS_ORDER,
  CENTERS_META,
  GATES_META,
  CHANNELS_META,
  calculateHumanDesignChart,
  summarizeHumanDesignChart,
  longitudeToGateLine,
  findDesignInstant,
};

