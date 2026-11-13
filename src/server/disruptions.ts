import { db } from './db.ts';
import type { IncidentSeverity, IncidentStatus, OperationalStatus, VerificationStatus } from '../types.ts';

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function writeAuditLog(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
  isSimulated = 0
) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json, created_at, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid('aud'), actorUserId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString(), isSimulated);
}

export function syncAssetAndGraphStatus(
  assetId: string,
  operationalStatus: OperationalStatus,
  verificationStatus: VerificationStatus,
  now: string
) {
  db.prepare(`
    UPDATE assets SET operational_status = ?, verification_status = ?, last_updated = ? WHERE id = ?
  `).run(operationalStatus, verificationStatus, now, assetId);

  db.prepare(`
    UPDATE map_edges SET operational_status = ? WHERE asset_id = ?
  `).run(operationalStatus, assetId);

  const asset = db.prepare('SELECT node_id, place_id FROM assets WHERE id = ?').get(assetId) as
    | { node_id: string | null; place_id: string | null }
    | undefined;

  if (asset?.node_id) {
    db.prepare(`
      UPDATE map_nodes SET operational_status = ?, verification_status = ? WHERE id = ?
    `).run(operationalStatus, verificationStatus, asset.node_id);
  }

  // Propagate to parent place if this is a critical entrance/lift asset
  if (asset?.place_id) {
    const unavailableCount = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM assets WHERE place_id = ? AND operational_status = 'unavailable'`)
        .get(asset.place_id) as { cnt: number }
    ).cnt;

    const placeOpStatus: OperationalStatus = unavailableCount > 0 ? 'degraded' : 'operational';
    const placeVerStatus: VerificationStatus = unavailableCount > 0 ? 'reported_unavailable' : 'verified';
    db.prepare(`
      UPDATE places SET operational_status = ?, verification_status = ?, last_updated = ? WHERE id = ?
    `).run(placeOpStatus, placeVerStatus, now, asset.place_id);
  }
}

export function notifyAffectedUsers(
  title: string,
  message: string,
  type: 'disruption' | 'incident_update' | 'route_alert' | 'system',
  relatedIncidentId: string | null,
  isSimulated = 0
) {
  const now = new Date().toISOString();
  const passengers = db.prepare(`SELECT id FROM users WHERE role = 'passenger'`).all() as Array<{ id: string }>;
  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, related_incident_id, read, created_at, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  for (const p of passengers) {
    insertNotif.run(uid('notif'), p.id, title, message, type, relatedIncidentId, now, isSimulated);
  }
}

export function createIncidentReport(input: {
  reporterUserId: string;
  category: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  assetId?: string | null;
  placeId?: string | null;
  lat: number;
  lng: number;
  photoDataUrl?: string | null;
  isSimulated?: number;
}) {
  const now = new Date().toISOString();
  const id = uid('inc');
  const reportCode = `AR-BLR-${Math.floor(200 + Math.random() * 799)}`;
  const isSim = input.isSimulated ?? 0;

  // Verification policy: Critical lift/ramp outages immediately mark asset as reported_unavailable
  // and update graph routing when severity is high/critical on a known asset
  const initialStatus: IncidentStatus = 'submitted';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO incidents (
        id, report_code, reporter_user_id, category, title, description, severity, status,
        asset_id, place_id, lat, lng, photo_data_url, assigned_operator_id, resolution_notes,
        created_at, updated_at, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(
      id,
      reportCode,
      input.reporterUserId,
      input.category,
      input.title,
      input.description,
      input.severity,
      initialStatus,
      input.assetId || null,
      input.placeId || null,
      input.lat,
      input.lng,
      input.photoDataUrl || null,
      now,
      now,
      isSim
    );

    db.prepare(`
      INSERT INTO incident_updates (id, incident_id, actor_user_id, from_status, to_status, note, created_at, is_simulated)
      VALUES (?, ?, ?, NULL, 'submitted', ?, ?, ?)
    `).run(uid('upd'), id, input.reporterUserId, 'Incident report submitted via AccessRoute.', now, isSim);

    if (input.assetId && (input.severity === 'high' || input.severity === 'critical' || input.category === 'Broken lift')) {
      syncAssetAndGraphStatus(input.assetId, 'unavailable', 'reported_unavailable', now);
      const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(input.assetId) as { name: string } | undefined;
      notifyAffectedUsers(
        `Disruption: ${asset?.name || input.title}`,
        `${input.title} (${reportCode}). Step-free routes have been recalculated around this barrier.`,
        'disruption',
        id,
        isSim
      );
    }

    writeAuditLog(input.reporterUserId, 'incident.created', 'incident', id, {
      reportCode,
      category: input.category,
      severity: input.severity,
      assetId: input.assetId || null,
    }, isSim);
  });

  tx();
  return db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
}

export function transitionIncidentStatus(input: {
  incidentId: string;
  actorUserId: string;
  nextStatus: IncidentStatus;
  note: string;
  assignedOperatorId?: string | null;
  resolutionNotes?: string | null;
}) {
  const operator = db
    .prepare('SELECT * FROM operators WHERE user_id = ?')
    .get(input.actorUserId) as
    | { id: string; can_verify: number; can_resolve: number; organisation_id: string }
    | undefined;

  if (!operator) {
    throw new Error('Forbidden: Only authorised operators can update incident status.');
  }
  if (input.nextStatus === 'verified' && !operator.can_verify) {
    throw new Error('Forbidden: Operator lacks verification permission.');
  }
  if ((input.nextStatus === 'resolved' || input.nextStatus === 'reopened') && !operator.can_resolve) {
    throw new Error('Forbidden: Operator lacks resolution permission.');
  }

  const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(input.incidentId) as
    | { id: string; report_code: string; status: IncidentStatus; asset_id: string | null; title: string; is_simulated: number }
    | undefined;

  if (!existing) {
    throw new Error('Incident not found.');
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE incidents
      SET status = ?,
          assigned_operator_id = COALESCE(?, assigned_operator_id),
          resolution_notes = COALESCE(?, resolution_notes),
          updated_at = ?
      WHERE id = ?
    `).run(
      input.nextStatus,
      input.assignedOperatorId !== undefined ? input.assignedOperatorId : operator.id,
      input.resolutionNotes !== undefined ? input.resolutionNotes : null,
      now,
      input.incidentId
    );

    db.prepare(`
      INSERT INTO incident_updates (id, incident_id, actor_user_id, from_status, to_status, note, created_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('upd'),
      input.incidentId,
      input.actorUserId,
      existing.status,
      input.nextStatus,
      input.note || `Transitioned from ${existing.status} to ${input.nextStatus}.`,
      now,
      existing.is_simulated
    );

    // Sync asset & routing graph based on transition
    if (existing.asset_id) {
      if (input.nextStatus === 'verified' || input.nextStatus === 'assigned' || input.nextStatus === 'in_progress' || input.nextStatus === 'reopened') {
        syncAssetAndGraphStatus(existing.asset_id, 'unavailable', 'reported_unavailable', now);
      } else if (input.nextStatus === 'resolved') {
        syncAssetAndGraphStatus(existing.asset_id, 'operational', 'verified', now);
        const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(existing.asset_id) as { name: string } | undefined;
        notifyAffectedUsers(
          `Restored: ${asset?.name || existing.title}`,
          `${existing.report_code} resolved. Step-free routing through ${asset?.name || 'this asset'} is operational again.`,
          'incident_update',
          existing.id,
          existing.is_simulated
        );
      }
    }

    writeAuditLog(input.actorUserId, `incident.${input.nextStatus}`, 'incident', input.incidentId, {
      from: existing.status,
      to: input.nextStatus,
      note: input.note,
    });
  });

  tx();
  return db.prepare('SELECT * FROM incidents WHERE id = ?').get(input.incidentId);
}

export function triggerSimulatedLiftOutage(actorUserId: string, assetId = 'asset-mg-lift') {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as
    | { id: string; name: string; place_id: string | null; lat: number; lng: number }
    | undefined;

  if (!asset) throw new Error('Simulated lift asset not found.');

  return createIncidentReport({
    reporterUserId: actorUserId,
    category: 'Broken lift',
    title: `Simulated Lift Outage: ${asset.name}`,
    description: 'Hackathon demonstration lift outage triggered to test live graph disruption detection and step-free rerouting.',
    severity: 'critical',
    assetId: asset.id,
    placeId: asset.place_id,
    lat: asset.lat,
    lng: asset.lng,
    isSimulated: 1,
  });
}
