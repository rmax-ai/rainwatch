import {
  DEFAULT_INTENSITY_THRESHOLDS,
  type ForecastLocation,
  type RainIntensityThresholds,
} from "@rainwatch/domain";
import { z } from "zod";

// SPEC §36: fail-fast env/config validation. SPEC §8, §9, §12, §20, §25.

export interface FusionWeights {
  /** lead minutes when radar weight starts dropping below 1 */
  blendStartMin: number; // 90
  /** lead minutes when radar weight reaches 0 */
  blendEndMin: number; // 120
}

export interface EventExtractionConfig {
  minIntensityMmPerHour: number; // 0.1
  minDurationMinutes: number; // 10
  mergeGapMinutes: number; // 10
}

export interface FreshnessConfig {
  freshMaxAgeMinutes: number; // 10
  degradedMaxAgeMinutes: number; // 20
}

export interface RainwatchConfig {
  location: ForecastLocation;
  intensityThresholds: RainIntensityThresholds;
  fusion: FusionWeights;
  events: EventExtractionConfig;
  freshness: FreshnessConfig;
  publishPath: string;
  knmiApiKey: string;
}

const ENV_SCHEMA = z.object({
  KNMI_API_KEY: z.string().min(1),
  PUBLISH_PATH: z.string().min(1),
  LOCATION_LAT: z.coerce.number().min(-90).max(90).default(52.37),
  LOCATION_LON: z.coerce.number().min(-180).max(180).default(4.85),
  LOCATION_LABEL: z.string().default("Amsterdam West"),
});

export const DEFAULTS = {
  location: {
    id: "amsterdam-west",
    label: "Amsterdam West",
    latitude: 52.37,
    longitude: 4.85,
  },
  intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
  fusion: { blendStartMin: 90, blendEndMin: 120 },
  events: {
    minIntensityMmPerHour: 0.1,
    minDurationMinutes: 10,
    mergeGapMinutes: 10,
  },
  freshness: { freshMaxAgeMinutes: 10, degradedMaxAgeMinutes: 20 },
} as const;

/**
 * SPEC §36: "Application startup should fail immediately if required configuration is invalid."
 * Throws with a clear message listing every invalid field.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RainwatchConfig {
  const parsed = ENV_SCHEMA.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration (SPEC §36 — fail fast):\n${issues}`);
  }
  const { KNMI_API_KEY, PUBLISH_PATH, LOCATION_LAT, LOCATION_LON, LOCATION_LABEL } = parsed.data;
  return {
    location: {
      id: "amsterdam-west",
      label: LOCATION_LABEL,
      latitude: LOCATION_LAT,
      longitude: LOCATION_LON,
    },
    intensityThresholds: DEFAULTS.intensityThresholds,
    fusion: { ...DEFAULTS.fusion },
    events: { ...DEFAULTS.events },
    freshness: { ...DEFAULTS.freshness },
    publishPath: PUBLISH_PATH,
    knmiApiKey: KNMI_API_KEY,
  };
}
