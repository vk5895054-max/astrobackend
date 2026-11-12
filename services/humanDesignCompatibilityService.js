const { CHANNELS_META } = require("./humanDesignService");

const asPlainChart = (chart) =>
  chart && typeof chart.toObject === "function" ? chart.toObject() : chart;

const getChannelIds = (chart) =>
  new Set(
    (Array.isArray(chart.channels) ? chart.channels : [])
      .map((channel) => String(channel?.id || "").trim())
      .filter(Boolean),
  );

const getGateNumbers = (chart) =>
  new Set(
    (Array.isArray(chart.gates) ? chart.gates : [])
      .map((gate) => Number(gate?.number))
      .filter((gate) => Number.isInteger(gate) && gate >= 1 && gate <= 64),
  );

const getDefinedCenters = (chart) =>
  new Set(
    (Array.isArray(chart.centers) ? chart.centers : [])
      .filter((center) => center?.defined === true)
      .map((center) => String(center.displayName || center.name || "").trim())
      .filter(Boolean),
  );

const calculateHumanDesignCompatibility = (rawChartA, rawChartB) => {
  const chartA = asPlainChart(rawChartA);
  const chartB = asPlainChart(rawChartB);
  if (
    !chartA ||
    !chartB ||
    !Array.isArray(chartA.centers) ||
    !Array.isArray(chartB.centers) ||
    !Array.isArray(chartA.gates) ||
    !Array.isArray(chartB.gates) ||
    !Array.isArray(chartA.channels) ||
    !Array.isArray(chartB.channels)
  ) {
    return null;
  }

  const channelsA = getChannelIds(chartA);
  const channelsB = getChannelIds(chartB);
  const gatesA = getGateNumbers(chartA);
  const gatesB = getGateNumbers(chartB);
  const centersA = getDefinedCenters(chartA);
  const centersB = getDefinedCenters(chartB);

  const sharedChannels = [...channelsA]
    .filter((id) => channelsB.has(id))
    .sort();
  const sharedCenters = [...centersA].filter((center) => centersB.has(center)).sort();
  const sharedGates = [...gatesA].filter((gate) => gatesB.has(gate)).sort((a, b) => a - b);
  const electromagneticChannels = CHANNELS_META.filter((channel) => {
    const [gateA, gateB] = channel.gates;
    return (
      !channelsA.has(channel.id) &&
      !channelsB.has(channel.id) &&
      ((gatesA.has(gateA) && gatesB.has(gateB)) ||
        (gatesA.has(gateB) && gatesB.has(gateA)))
    );
  }).map((channel) => ({
      id: channel.id,
      name: channel.name,
    }));

  const details = [];
  if (sharedCenters.length > 0) {
    details.push(
      `You both have defined energy in ${sharedCenters.join(", ")}.`,
    );
  }
  if (electromagneticChannels.length > 0) {
    details.push(
      `Together, your active gates complete ${electromagneticChannels.map((channel) => channel.name).join(", ")}.`,
    );
  }
  if (sharedChannels.length > 0) {
    details.push(
      `You share the defined ${sharedChannels.length === 1 ? "channel" : "channels"} ${sharedChannels.join(", ")}.`,
    );
  }
  if (sharedGates.length > 0) {
    details.push(
      `You both carry gates ${sharedGates.join(", ")} in your charts.`,
    );
  }
  if (details.length === 0) {
    details.push(
      "Your charts bring different energy patterns; use them as a prompt for conversation, not a prediction.",
    );
  }

  const typeA = chartA.typeLabel || chartA.type || "";
  const typeB = chartB.typeLabel || chartB.type || "";
  const summary =
    electromagneticChannels.length > 0
      ? `Your active gates complete ${electromagneticChannels.length} channel connection${electromagneticChannels.length === 1 ? "" : "s"}.`
      : sharedCenters.length > 0
        ? `You share defined energy in ${sharedCenters.join(", ")}.`
        : "Your charts bring distinct Human Design patterns to the connection.";

  return {
    typeA,
    typeB,
    summary,
    details,
    sharedCenters,
    sharedChannels,
    sharedGates,
    electromagneticChannels,
  };
};

module.exports = { calculateHumanDesignCompatibility };
