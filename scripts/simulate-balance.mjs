import { simulateCohort, simulateProgression } from "../js/simulation.js";

const args = parseArguments(process.argv.slice(2));
const seed = Number(args.seed || 41021);
const runs = Number(args.runs || 250);
const regionId = args.region || "caverna_sombria";
const profiles = args.profile ? [args.profile] : ["standard", "skilled", "cautious"];
const report = {
  generatedAt: new Date().toISOString(),
  disclaimer: "Modelo determinístico de balanceamento; não representa telemetria nem comportamento real de jogadores.",
  assumptions: "Farm manual aproximado por precisão, cadência, esquiva, ondas, metas de abate, exploração, retornos táticos e visitas à vila configuradas por perfil.",
  seed, runs, regionId,
  sample: simulateProgression({ seed, profile: profiles[0], regionId }),
  cohorts: Object.fromEntries(profiles.map(profile => [profile, simulateCohort({ seed, runs, profile, regionId })]))
};

console.log(JSON.stringify(report, null, 2));

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const following = argv[index + 1];
    if (inlineValue !== undefined) parsed[rawKey] = inlineValue;
    else if (following && !following.startsWith("--")) { parsed[rawKey] = following; index += 1; }
    else parsed[rawKey] = "true";
  }
  return parsed;
}
