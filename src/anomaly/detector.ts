import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getConfigBoolean, getConfigNumber } from "../config/global.js";
import type { AnomalyAlertRecord, FlightRecord } from "../types.js";

/**
 * Check a completed flight for anomalies against baselines.
 * Called after flight completion.
 */
export function checkFlightAnomaly(
  flight: FlightRecord,
  blueprintId: string,
  durationSeconds: number,
  tokens: number,
): AnomalyAlertRecord | null {
  if (!getConfigBoolean("anomaly_detection_enabled", false)) return null;

  const sigmaThreshold = getConfigNumber("anomaly_sigma_threshold", 2.0);
  const criticalSigma = getConfigNumber("anomaly_critical_sigma", 3.0);
  const minSamples = getConfigNumber("anomaly_min_samples", 10);

  // Check duration baseline
  const durationBaseline = db.getFlightBaseline(blueprintId, flight.flight_id, "duration_seconds");
  if (durationBaseline && durationBaseline.sample_count >= minSamples && durationBaseline.stddev > 0) {
    const sigma = Math.abs(durationSeconds - durationBaseline.mean) / durationBaseline.stddev;
    if (sigma >= sigmaThreshold) {
      const severity = sigma >= criticalSigma ? "critical" : "warning";
      const alert = db.insertAnomalyAlert(
        flight.swarm_id,
        flight.flight_id,
        blueprintId,
        "duration_seconds",
        durationSeconds,
        durationBaseline.mean,
        durationBaseline.stddev,
        Math.round(sigma * 100) / 100,
        severity,
      );

      emitEvent({
        eventType: "anomaly.detected",
        swarmId: flight.swarm_id,
        payload: {
          alert_id: alert.id,
          flight_id: flight.flight_id,
          metric: "duration_seconds",
          sigma: Math.round(sigma * 100) / 100,
          severity,
        },
      });

      logger.warn("Anomaly detected: duration", {
        flightId: flight.flight_id,
        observed: durationSeconds,
        mean: durationBaseline.mean,
        sigma: Math.round(sigma * 100) / 100,
      });

      return alert;
    }
  }

  // Check token baseline
  const tokenBaseline = db.getFlightBaseline(blueprintId, flight.flight_id, "tokens");
  if (tokenBaseline && tokenBaseline.sample_count >= minSamples && tokenBaseline.stddev > 0) {
    const sigma = Math.abs(tokens - tokenBaseline.mean) / tokenBaseline.stddev;
    if (sigma >= sigmaThreshold) {
      const severity = sigma >= criticalSigma ? "critical" : "warning";
      const alert = db.insertAnomalyAlert(
        flight.swarm_id,
        flight.flight_id,
        blueprintId,
        "tokens",
        tokens,
        tokenBaseline.mean,
        tokenBaseline.stddev,
        Math.round(sigma * 100) / 100,
        severity,
      );

      emitEvent({
        eventType: "anomaly.detected",
        swarmId: flight.swarm_id,
        payload: {
          alert_id: alert.id,
          flight_id: flight.flight_id,
          metric: "tokens",
          sigma: Math.round(sigma * 100) / 100,
          severity,
        },
      });

      logger.warn("Anomaly detected: tokens", {
        flightId: flight.flight_id,
        observed: tokens,
        mean: tokenBaseline.mean,
        sigma: Math.round(sigma * 100) / 100,
      });

      return alert;
    }
  }

  return null;
}

/**
 * Get anomaly alerts with optional filters.
 */
export function getAlerts(filters?: { swarm_id?: string; acknowledged?: boolean; limit?: number }): AnomalyAlertRecord[] {
  return db.getAnomalyAlerts(filters);
}

/**
 * Acknowledge an anomaly alert.
 */
export function acknowledgeAlert(alertId: string): { success: boolean; error?: string } {
  const acknowledged = db.acknowledgeAnomalyAlert(alertId);
  if (!acknowledged) {
    return { success: false, error: `Alert not found: ${alertId}` };
  }

  emitEvent({
    eventType: "anomaly.acknowledged",
    payload: { alert_id: alertId },
  });

  return { success: true };
}
