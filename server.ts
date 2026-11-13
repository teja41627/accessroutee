import 'dotenv/config';
import express from 'express';
import path from 'path';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { db, initSchema, seedSimulatedBengaluruNetwork } from './src/server/db.ts';
import { computeRoutes, getVenueIndoorData } from './src/server/routing.ts';
import {
  createIncidentReport,
  transitionIncidentStatus,
  triggerSimulatedLiftOutage,
  writeAuditLog,
} from './src/server/disruptions.ts';
import { handleAskAccessRoute } from './src/server/assistant.ts';
import type { IncidentSeverity, IncidentStatus } from './src/types.ts';

initSchema();
seedSimulatedBengaluruNetwork(false);

const app = express();
app.use(express.json({ limit: '5mb' }));

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getFullUserProfile(userId: string) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | { id: string; email: string; name: string; role: string; avatar_url: string | null; is_simulated: number }
    | undefined;
  if (!user) return null;

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  const operator = db
    .prepare(`
      SELECT o.*, org.name as organisation_name
      FROM operators o
      JOIN organisations org ON o.organisation_id = org.id
      WHERE o.user_id = ?
    `)
    .get(userId) as Record<string, unknown> | undefined;

  return {
    ...user,
    display_name: (profile?.display_name as string) || user.name,
    language: (profile?.language as string) || 'English (India)',
    step_free: Boolean(profile?.step_free ?? 1),
    avoid_stairs: Boolean(profile?.avoid_stairs ?? 1),
    wheelchair_accessible: Boolean(profile?.wheelchair_accessible ?? 1),
    max_walking_m: (profile?.max_walking_m as number) ?? 1200,
    prefer_fewer_transfers: Boolean(profile?.prefer_fewer_transfers ?? 1),
    audio_instructions: Boolean(profile?.audio_instructions ?? 1),
    visual_instructions: Boolean(profile?.visual_instructions ?? 1),
    simplified_guidance: Boolean(profile?.simplified_guidance ?? 0),
    optional_accessibility_notes: (profile?.optional_accessibility_notes as string) || '',
    high_contrast: Boolean(profile?.high_contrast ?? 0),
    large_text: Boolean(profile?.large_text ?? 0),
    reduced_motion: Boolean(profile?.reduced_motion ?? 0),
    updated_at: (profile?.updated_at as string) || new Date().toISOString(),
    operator: operator
      ? {
          ...operator,
          can_verify: Boolean(operator.can_verify),
          can_resolve: Boolean(operator.can_resolve),
          can_publish_maps: Boolean(operator.can_publish_maps),
        }
      : null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'AccessRoute API' });
});

app.get('/api/bootstrap', (req, res) => {
  const userId = (req.query.userId as string) || 'user-aarav';
  const activeProfile = getFullUserProfile(userId) || getFullUserProfile('user-aarav');
  const activeUserId = activeProfile?.id || 'user-aarav';

  const users = db
    .prepare(`
      SELECT u.id, u.name, u.email, u.role, u.is_simulated,
             o.title as operator_title, org.name as organisation_name
      FROM users u
      LEFT JOIN operators o ON o.user_id = u.id
      LEFT JOIN organisations org ON o.organisation_id = org.id
      ORDER BY CASE u.role WHEN 'passenger' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END, u.name ASC
    `)
    .all();

  const places = db.prepare('SELECT * FROM places ORDER BY name ASC').all();
  const assets = db.prepare('SELECT * FROM assets ORDER BY name ASC').all();
  const venues = (db
    .prepare('SELECT * FROM venues ORDER BY name ASC')
    .all() as Array<Record<string, unknown>>)
    .map((v) => ({ ...v, published: Boolean(v.published) }));
  const organisations = db.prepare('SELECT * FROM organisations ORDER BY name ASC').all();
  const operators = (db
    .prepare(`
      SELECT o.*, u.name, u.email, org.name as organisation_name
      FROM operators o
      JOIN users u ON o.user_id = u.id
      JOIN organisations org ON o.organisation_id = org.id
    `)
    .all() as Array<Record<string, unknown>>)
    .map((o) => ({
      ...o,
      can_verify: Boolean(o.can_verify),
      can_resolve: Boolean(o.can_resolve),
      can_publish_maps: Boolean(o.can_publish_maps),
    }));

  const incidents = db
    .prepare(`
      SELECT i.*, u.name as reporter_name, a.name as asset_name, p.name as place_name,
             ou.name as assigned_operator_name
      FROM incidents i
      LEFT JOIN users u ON i.reporter_user_id = u.id
      LEFT JOIN assets a ON i.asset_id = a.id
      LEFT JOIN places p ON i.place_id = p.id
      LEFT JOIN operators op ON i.assigned_operator_id = op.id
      LEFT JOIN users ou ON op.user_id = ou.id
      ORDER BY i.updated_at DESC
    `)
    .all();

  const savedPlaces = db
    .prepare(`SELECT * FROM saved_places WHERE user_id = ? ORDER BY created_at DESC`)
    .all(activeUserId);

  const journeys = db
    .prepare(`SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .all(activeUserId);

  const notifications = (db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`)
    .all(activeUserId) as Array<Record<string, unknown>>)
    .map((n) => ({ ...n, read: Boolean(n.read) }));

  const outdoorNodes = (db
    .prepare(`SELECT * FROM map_nodes WHERE venue_id IS NULL`)
    .all() as Array<Record<string, unknown>>)
    .map((n) => ({
      ...n,
      wheelchair_accessible: Boolean(n.wheelchair_accessible),
      step_free: Boolean(n.step_free),
      has_tactile_paving: Boolean(n.has_tactile_paving),
    }));

  const outdoorEdges = db
    .prepare(`
      SELECT e.*, n1.lat as from_lat, n1.lng as from_lng, n2.lat as to_lat, n2.lng as to_lng,
             a.operational_status as asset_status
      FROM map_edges e
      JOIN map_nodes n1 ON e.from_node_id = n1.id
      JOIN map_nodes n2 ON e.to_node_id = n2.id
      LEFT JOIN assets a ON e.asset_id = a.id
      WHERE n1.venue_id IS NULL OR n2.venue_id IS NULL
    `)
    .all();

  res.json({
    activeProfile,
    users,
    places,
    assets,
    venues,
    organisations,
    operators,
    incidents,
    savedPlaces,
    journeys,
    notifications,
    outdoorNodes,
    outdoorEdges,
  });
});

app.get('/api/places', (req, res) => {
  const q = ((req.query.q as string) || '').trim().toLowerCase();
  const category = (req.query.category as string) || 'all';
  const stepFreeOnly = req.query.stepFreeOnly === 'true';

  let places = db.prepare('SELECT * FROM places ORDER BY name ASC').all() as Array<Record<string, unknown>>;
  if (category !== 'all' && category !== 'accessible') {
    places = places.filter((p) => p.category === category);
  }
  if (category === 'accessible' || stepFreeOnly) {
    places = places.filter((p) => p.operational_status === 'operational' && p.verification_status === 'verified');
  }
  if (q) {
    places = places.filter(
      (p) =>
        String(p.name).toLowerCase().includes(q) ||
        String(p.address).toLowerCase().includes(q) ||
        String(p.category).toLowerCase().includes(q) ||
        String(p.accessibility_summary).toLowerCase().includes(q)
    );
  }
  res.json({ places });
});

app.post('/api/routes/plan', (req, res) => {
  try {
    const { originNodeId, destinationNodeId, constraints } = req.body as {
      originNodeId: string;
      destinationNodeId: string;
      constraints: {
        stepFree?: boolean;
        avoidStairs?: boolean;
        wheelchairAccessible?: boolean;
        maxWalkingM?: number;
        preferFewerTransfers?: boolean;
      };
    };
    const result = computeRoutes(originNodeId, destinationNodeId, {
      stepFree: constraints?.stepFree ?? true,
      avoidStairs: constraints?.avoidStairs ?? true,
      wheelchairAccessible: constraints?.wheelchairAccessible ?? true,
      maxWalkingM: constraints?.maxWalkingM ?? 1500,
      preferFewerTransfers: constraints?.preferFewerTransfers ?? true,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to plan route' });
  }
});

app.get('/api/venues', (_req, res) => {
  const venues = (db
    .prepare('SELECT * FROM venues ORDER BY name ASC')
    .all() as Array<Record<string, unknown>>)
    .map((v) => ({ ...v, published: Boolean(v.published) }));
  res.json({ venues });
});

app.post('/api/venues', (req, res) => {
  const { actorUserId, name, category, address, description, lat, lng, organisationId } = req.body;
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(actorUserId);
  if (!operator) {
    return res.status(403).json({ error: 'Authorised operator access required to create venues.' });
  }
  const id = uid('venue');
  const floorId = uid('floor');
  const entNodeId = uid('node');
  const placeId = uid('place');
  const now = new Date().toISOString();
  const token = `AR-VENUE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO venues (id, name, category, address, description, lat, lng, organisation_id, published, qr_code_token, updated_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
    `).run(id, name, category || 'venue', address, description || '', Number(lat) || 12.9735, Number(lng) || 77.595, organisationId || 'org-civic', token, now);

    db.prepare(`INSERT INTO floors (id, venue_id, level_number, name, map_version_id, is_simulated) VALUES (?, ?, 0, 'Ground Floor (G)', NULL, 0)`).run(floorId, id);
    db.prepare(`
      INSERT INTO map_nodes (id, node_type, name, lat, lng, venue_id, floor_id, x_norm, y_norm, wheelchair_accessible, step_free, has_tactile_paving, door_width_cm, operational_status, verification_status, qr_landmark_code, is_simulated)
      VALUES (?, 'entrance', ?, ?, ?, ?, ?, 0.5, 0.2, 1, 1, 1, 140, 'operational', 'verified', ?, 0)
    `).run(entNodeId, `${name} Entrance`, Number(lat) || 12.9735, Number(lng) || 77.595, id, floorId, `AR-QR-${id.slice(-4).toUpperCase()}`);

    db.prepare(`
      INSERT INTO places (id, name, category, address, lat, lng, accessibility_summary, operational_status, verification_status, data_source, last_updated, organisation_id, venue_id, primary_node_id, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'operational', 'unverified', 'Operator Venue Registry', ?, ?, ?, ?, 0)
    `).run(placeId, name, category || 'venue', address, Number(lat) || 12.9735, Number(lng) || 77.595, description || 'Newly registered venue', now, organisationId || 'org-civic', id, entNodeId);

    writeAuditLog(actorUserId, 'venue.created', 'venue', id, { name });
  });

  tx();
  res.json({ venue: db.prepare('SELECT * FROM venues WHERE id = ?').get(id) });
});

app.patch('/api/venues/:id', (req, res) => {
  const { actorUserId, name, address, description, published } = req.body;
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(actorUserId);
  if (!operator) {
    return res.status(403).json({ error: 'Authorised operator access required.' });
  }
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE venues
    SET name = COALESCE(?, name),
        address = COALESCE(?, address),
        description = COALESCE(?, description),
        published = COALESCE(?, published),
        updated_at = ?
    WHERE id = ?
  `).run(name ?? null, address ?? null, description ?? null, published !== undefined ? (published ? 1 : 0) : null, now, req.params.id);
  writeAuditLog(actorUserId, 'venue.updated', 'venue', req.params.id, { name, published });
  res.json({ venue: db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id) });
});

app.get('/api/venues/:id/indoor', (req, res) => {
  const data = getVenueIndoorData(req.params.id);
  if (!data) return res.status(404).json({ error: 'Venue not found' });
  res.json(data);
});

app.post('/api/venues/:id/indoor-editor', (req, res) => {
  const { actorUserId, action, payload } = req.body;
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(actorUserId) as
    | { id: string; can_publish_maps: number }
    | undefined;
  if (!operator) {
    return res.status(403).json({ error: 'Authorised operator required to edit indoor maps.' });
  }

  const venueId = req.params.id;
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId) as { lat: number; lng: number } | undefined;
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const now = new Date().toISOString();

  if (action === 'add_node') {
    const id = uid('node');
    db.prepare(`
      INSERT INTO map_nodes (id, node_type, name, lat, lng, venue_id, floor_id, x_norm, y_norm, wheelchair_accessible, step_free, has_tactile_paving, door_width_cm, operational_status, verification_status, qr_landmark_code, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'operational', 'verified', ?, 0)
    `).run(
      id,
      payload.nodeType || 'corridor',
      payload.name || 'New Landmark',
      venue.lat + ((payload.yNorm ?? 0.5) - 0.5) * 0.0005,
      venue.lng + ((payload.xNorm ?? 0.5) - 0.5) * 0.0005,
      venueId,
      payload.floorId,
      payload.xNorm ?? 0.5,
      payload.yNorm ?? 0.5,
      payload.wheelchairAccessible === false ? 0 : 1,
      payload.stepFree === false ? 0 : 1,
      payload.hasTactilePaving ? 1 : 0,
      payload.doorWidthCm ?? 120,
      `AR-QR-${id.slice(-4).toUpperCase()}`
    );
    writeAuditLog(actorUserId, 'indoor_map.add_node', 'venue', venueId, { nodeId: id, nodeType: payload.nodeType });
  } else if (action === 'move_node') {
    db.prepare(`UPDATE map_nodes SET x_norm = ?, y_norm = ? WHERE id = ? AND venue_id = ?`).run(
      payload.xNorm,
      payload.yNorm,
      payload.nodeId,
      venueId
    );
  } else if (action === 'update_node') {
    db.prepare(`
      UPDATE map_nodes
      SET name = COALESCE(?, name),
          node_type = COALESCE(?, node_type),
          wheelchair_accessible = COALESCE(?, wheelchair_accessible),
          step_free = COALESCE(?, step_free),
          has_tactile_paving = COALESCE(?, has_tactile_paving),
          door_width_cm = COALESCE(?, door_width_cm)
      WHERE id = ? AND venue_id = ?
    `).run(
      payload.name ?? null,
      payload.nodeType ?? null,
      payload.wheelchairAccessible !== undefined ? (payload.wheelchairAccessible ? 1 : 0) : null,
      payload.stepFree !== undefined ? (payload.stepFree ? 1 : 0) : null,
      payload.hasTactilePaving !== undefined ? (payload.hasTactilePaving ? 1 : 0) : null,
      payload.doorWidthCm ?? null,
      payload.nodeId,
      venueId
    );
  } else if (action === 'connect_nodes') {
    const id = uid('edge');
    const edgeType = payload.edgeType || 'corridor';
    const isStairs = edgeType === 'staircase';
    db.prepare(`
      INSERT INTO map_edges (id, from_node_id, to_node_id, bidirectional, distance_m, estimated_seconds, edge_type, has_stairs, step_free, wheelchair_accessible, max_slope_pct, surface_quality, width_cm, operational_status, asset_id, is_simulated)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'smooth', ?, 'operational', NULL, 0)
    `).run(
      id,
      payload.fromNodeId,
      payload.toNodeId,
      payload.distanceM || 25,
      payload.estimatedSeconds || 25,
      edgeType,
      isStairs ? 1 : 0,
      isStairs ? 0 : 1,
      isStairs ? 0 : 1,
      edgeType === 'ramp' ? 5.5 : 0,
      isStairs ? 140 : 180
    );
    writeAuditLog(actorUserId, 'indoor_map.connect_nodes', 'venue', venueId, { edgeId: id, edgeType });
  } else if (action === 'add_floor') {
    const floorId = uid('floor');
    db.prepare(`INSERT INTO floors (id, venue_id, level_number, name, map_version_id, is_simulated) VALUES (?, ?, ?, ?, NULL, 0)`).run(
      floorId,
      venueId,
      payload.levelNumber ?? 2,
      payload.name || `Level ${payload.levelNumber ?? 2}`
    );
  } else if (action === 'save_draft' || action === 'publish') {
    if (action === 'publish' && !operator.can_publish_maps) {
      return res.status(403).json({ error: 'Operator lacks permission to publish maps.' });
    }
    const latest = db
      .prepare('SELECT COALESCE(MAX(version_number), 0) as max_v FROM map_versions WHERE venue_id = ?')
      .get(venueId) as { max_v: number };
    const nextVer = latest.max_v + 1;
    const versionId = uid('mv');
    const snapshot = getVenueIndoorData(venueId);

    db.prepare(`
      INSERT INTO map_versions (id, venue_id, version_number, status, snapshot_json, published_by_user_id, created_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(versionId, venueId, nextVer, action === 'publish' ? 'published' : 'draft', JSON.stringify(snapshot), actorUserId, now);

    if (action === 'publish') {
      db.prepare('UPDATE venues SET published = 1, updated_at = ? WHERE id = ?').run(now, venueId);
      db.prepare('UPDATE floors SET map_version_id = ? WHERE venue_id = ?').run(versionId, venueId);
      db.prepare(`UPDATE places SET verification_status = 'verified', last_updated = ? WHERE venue_id = ?`).run(now, venueId);
    }
    writeAuditLog(actorUserId, `indoor_map.${action}`, 'venue', venueId, { versionNumber: nextVer });
  }

  res.json(getVenueIndoorData(venueId));
});

app.get('/api/venues/:id/qr', async (req, res) => {
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id) as
    | { id: string; name: string; qr_code_token: string }
    | undefined;
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const landmarkCode = (req.query.landmark as string) || venue.qr_code_token;
  const payload = `accessroute://indoor/${venue.id}?code=${encodeURIComponent(landmarkCode)}`;
  const dataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 2, color: { dark: '#102B27', light: '#FFFFFF' } });
  const svg = await QRCode.toString(payload, { type: 'svg', margin: 2, color: { dark: '#102B27', light: '#FFFFFF' } });

  res.json({ venueId: venue.id, venueName: venue.name, token: landmarkCode, payload, dataUrl, svg });
});

app.get('/api/qr/resolve', (req, res) => {
  const raw = ((req.query.code as string) || '').trim();
  const cleaned = raw.includes('code=') ? decodeURIComponent(raw.split('code=')[1].split('&')[0]) : raw;

  const venue = db
    .prepare('SELECT * FROM venues WHERE qr_code_token = ? OR id = ?')
    .get(cleaned, cleaned) as { id: string; name: string } | undefined;

  if (venue) {
    const firstFloor = db
      .prepare('SELECT * FROM floors WHERE venue_id = ? ORDER BY level_number ASC LIMIT 1')
      .get(venue.id) as { id: string } | undefined;
    const entNode = db
      .prepare('SELECT * FROM map_nodes WHERE venue_id = ? AND node_type = ? LIMIT 1')
      .get(venue.id, 'entrance') as { id: string; name: string } | undefined;
    return res.json({
      matched: true,
      type: 'venue',
      venueId: venue.id,
      venueName: venue.name,
      floorId: firstFloor?.id || null,
      nodeId: entNode?.id || null,
      landmarkName: entNode?.name || venue.name,
    });
  }

  const node = db
    .prepare('SELECT * FROM map_nodes WHERE qr_landmark_code = ? OR id = ?')
    .get(cleaned, cleaned) as { id: string; name: string; venue_id: string | null; floor_id: string | null } | undefined;

  if (node && node.venue_id) {
    const v = db.prepare('SELECT name FROM venues WHERE id = ?').get(node.venue_id) as { name: string } | undefined;
    return res.json({
      matched: true,
      type: 'landmark',
      venueId: node.venue_id,
      venueName: v?.name || 'Mapped Venue',
      floorId: node.floor_id,
      nodeId: node.id,
      landmarkName: node.name,
    });
  }

  return res.status(404).json({ matched: false, error: 'QR code did not match a published venue or indoor landmark.' });
});

app.get('/api/incidents', (req, res) => {
  const status = (req.query.status as string) || 'all';
  const reporterId = req.query.reporterId as string | undefined;

  let sql = `
    SELECT i.*, u.name as reporter_name, a.name as asset_name, p.name as place_name,
           ou.name as assigned_operator_name
    FROM incidents i
    LEFT JOIN users u ON i.reporter_user_id = u.id
    LEFT JOIN assets a ON i.asset_id = a.id
    LEFT JOIN places p ON i.place_id = p.id
    LEFT JOIN operators op ON i.assigned_operator_id = op.id
    LEFT JOIN users ou ON op.user_id = ou.id
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status !== 'all') {
    conditions.push('i.status = ?');
    params.push(status);
  }
  if (reporterId) {
    conditions.push('i.reporter_user_id = ?');
    params.push(reporterId);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY i.updated_at DESC';

  const incidents = db.prepare(sql).all(...params);
  res.json({ incidents });
});

app.get('/api/incidents/:id', (req, res) => {
  const incident = db
    .prepare(`
      SELECT i.*, u.name as reporter_name, a.name as asset_name, p.name as place_name,
             ou.name as assigned_operator_name
      FROM incidents i
      LEFT JOIN users u ON i.reporter_user_id = u.id
      LEFT JOIN assets a ON i.asset_id = a.id
      LEFT JOIN places p ON i.place_id = p.id
      LEFT JOIN operators op ON i.assigned_operator_id = op.id
      LEFT JOIN users ou ON op.user_id = ou.id
      WHERE i.id = ?
    `)
    .get(req.params.id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const updates = db
    .prepare(`
      SELECT iu.*, u.name as actor_name
      FROM incident_updates iu
      LEFT JOIN users u ON iu.actor_user_id = u.id
      WHERE iu.incident_id = ?
      ORDER BY iu.created_at ASC
    `)
    .all(req.params.id);

  res.json({ incident, updates });
});

app.post('/api/incidents', (req, res) => {
  try {
    const { reporterUserId, category, title, description, severity, assetId, placeId, lat, lng, photoDataUrl } = req.body;
    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required.' });
    }
    const created = createIncidentReport({
      reporterUserId: reporterUserId || 'user-aarav',
      category,
      title,
      description: description || '',
      severity: (severity as IncidentSeverity) || 'medium',
      assetId: assetId || null,
      placeId: placeId || null,
      lat: Number(lat) || 12.9756,
      lng: Number(lng) || 77.6066,
      photoDataUrl: photoDataUrl || null,
      isSimulated: 0,
    });
    res.status(201).json({ incident: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create incident' });
  }
});

app.post('/api/incidents/:id/transition', (req, res) => {
  try {
    const { actorUserId, nextStatus, note, assignedOperatorId, resolutionNotes } = req.body;
    const updated = transitionIncidentStatus({
      incidentId: req.params.id,
      actorUserId,
      nextStatus: nextStatus as IncidentStatus,
      note: note || '',
      assignedOperatorId,
      resolutionNotes,
    });
    res.json({ incident: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to transition incident';
    res.status(msg.startsWith('Forbidden') ? 403 : 400).json({ error: msg });
  }
});

app.post('/api/disruptions/simulate-lift-outage', (req, res) => {
  try {
    const { actorUserId, assetId } = req.body;
    const incident = triggerSimulatedLiftOutage(actorUserId || 'user-aarav', assetId || 'asset-mg-lift');
    res.status(201).json({ incident });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to simulate outage' });
  }
});

app.patch('/api/profile/:userId', (req, res) => {
  const userId = req.params.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const b = req.body;
  const now = new Date().toISOString();

  if (b.displayName) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(b.displayName, userId);
  }

  db.prepare(`
    UPDATE profiles SET
      display_name = COALESCE(?, display_name),
      language = COALESCE(?, language),
      step_free = COALESCE(?, step_free),
      avoid_stairs = COALESCE(?, avoid_stairs),
      wheelchair_accessible = COALESCE(?, wheelchair_accessible),
      max_walking_m = COALESCE(?, max_walking_m),
      prefer_fewer_transfers = COALESCE(?, prefer_fewer_transfers),
      audio_instructions = COALESCE(?, audio_instructions),
      visual_instructions = COALESCE(?, visual_instructions),
      simplified_guidance = COALESCE(?, simplified_guidance),
      optional_accessibility_notes = COALESCE(?, optional_accessibility_notes),
      high_contrast = COALESCE(?, high_contrast),
      large_text = COALESCE(?, large_text),
      reduced_motion = COALESCE(?, reduced_motion),
      updated_at = ?
    WHERE user_id = ?
  `).run(
    b.display_name ?? b.displayName ?? null,
    b.language ?? null,
    b.step_free !== undefined ? (b.step_free ? 1 : 0) : null,
    b.avoid_stairs !== undefined ? (b.avoid_stairs ? 1 : 0) : null,
    b.wheelchair_accessible !== undefined ? (b.wheelchair_accessible ? 1 : 0) : null,
    b.max_walking_m ?? null,
    b.prefer_fewer_transfers !== undefined ? (b.prefer_fewer_transfers ? 1 : 0) : null,
    b.audio_instructions !== undefined ? (b.audio_instructions ? 1 : 0) : null,
    b.visual_instructions !== undefined ? (b.visual_instructions ? 1 : 0) : null,
    b.simplified_guidance !== undefined ? (b.simplified_guidance ? 1 : 0) : null,
    b.optional_accessibility_notes ?? null,
    b.high_contrast !== undefined ? (b.high_contrast ? 1 : 0) : null,
    b.large_text !== undefined ? (b.large_text ? 1 : 0) : null,
    b.reduced_motion !== undefined ? (b.reduced_motion ? 1 : 0) : null,
    now,
    userId
  );

  res.json({ profile: getFullUserProfile(userId) });
});

app.delete('/api/profile/:userId', (req, res) => {
  const userId = req.params.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as { is_simulated: number } | undefined;
  if (!user) return res.status(404).json({ error: 'Profile not found' });
  if (userId === 'user-aarav') {
    // Reset Aarav's optional personal notes & clear custom saved data rather than breaking default demo persona
    db.prepare(`UPDATE profiles SET optional_accessibility_notes = '', updated_at = ? WHERE user_id = ?`).run(
      new Date().toISOString(),
      userId
    );
    return res.json({ deleted: true, fallbackUserId: 'user-meera', message: 'Personal profile preferences cleared.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ deleted: true, fallbackUserId: 'user-aarav' });
});

app.post('/api/saved-places', (req, res) => {
  const { userId, placeId, label, routeJson } = req.body;
  const id = uid('sav');
  db.prepare(`
    INSERT INTO saved_places (id, user_id, place_id, label, route_json, created_at, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, userId || 'user-aarav', placeId || null, label || 'Saved Place', routeJson || null, new Date().toISOString());
  res.status(201).json({ savedPlace: db.prepare('SELECT * FROM saved_places WHERE id = ?').get(id) });
});

app.delete('/api/saved-places/:id', (req, res) => {
  db.prepare('DELETE FROM saved_places WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

app.post('/api/journeys', (req, res) => {
  const { userId, originLabel, originNodeId, destinationLabel, destinationNodeId, routeMode, distanceM, durationMin, walkingM, status } = req.body;
  const id = uid('jrn');
  db.prepare(`
    INSERT INTO journeys (id, user_id, origin_label, origin_node_id, destination_label, destination_node_id, route_mode, distance_m, duration_min, walking_m, status, created_at, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    userId || 'user-aarav',
    originLabel,
    originNodeId || null,
    destinationLabel,
    destinationNodeId || null,
    routeMode || 'most_accessible',
    distanceM || 0,
    durationMin || 1,
    walkingM || 0,
    status || 'active',
    new Date().toISOString()
  );
  res.status(201).json({ journey: db.prepare('SELECT * FROM journeys WHERE id = ?').get(id) });
});

app.patch('/api/journeys/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE journeys SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ journey: db.prepare('SELECT * FROM journeys WHERE id = ?').get(req.params.id) });
});

app.post('/api/notifications/mark-all-read', (req, res) => {
  const { userId } = req.body;
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId || 'user-aarav');
  res.json({ ok: true });
});

app.get('/api/business/overview', (req, res) => {
  const userId = (req.query.userId as string) || 'user-aarav';
  const operator = db
    .prepare(`
      SELECT o.*, org.name as organisation_name, org.type as organisation_type
      FROM operators o
      JOIN organisations org ON o.organisation_id = org.id
      WHERE o.user_id = ?
    `)
    .get(userId) as Record<string, unknown> | undefined;

  const auditLogs = db
    .prepare(`
      SELECT a.*, u.name as actor_name
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 40
    `)
    .all();

  const allIncidents = db.prepare('SELECT status FROM incidents').all() as Array<{ status: string }>;
  const openCount = allIncidents.filter((i) => i.status !== 'resolved').length;
  const pendingCount = allIncidents.filter((i) => i.status === 'submitted' || i.status === 'under_review').length;
  const resolvedCount = allIncidents.filter((i) => i.status === 'resolved').length;
  const resolutionRate = allIncidents.length ? Math.round((resolvedCount / allIncidents.length) * 100) : 100;

  res.json({
    authorised: Boolean(operator),
    operator: operator || null,
    metrics: {
      openIncidents: openCount,
      pendingReports: pendingCount,
      resolvedIncidents: resolvedCount,
      resolutionRatePct: resolutionRate,
    },
    auditLogs,
  });
});

app.post('/api/business/request-access', (req, res) => {
  const { userId, organisationName, roleNote } = req.body;
  writeAuditLog(userId || 'user-aarav', 'business.access_requested', 'organisation', 'org-bmrcl', {
    organisationName,
    roleNote,
  });
  res.json({
    requested: true,
    message: 'Organisation access request logged. For hackathon testing, switch to Priya Menon (Authorised Operator) in the switcher.',
  });
});

app.post('/api/admin/reset-demo', (req, res) => {
  const { actorUserId } = req.body;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(actorUserId) as { role: string } | undefined;
  const op = db.prepare('SELECT role FROM operators WHERE user_id = ?').get(actorUserId) as { role: string } | undefined;
  if (!user || (user.role !== 'admin' && op?.role !== 'admin' && op?.role !== 'manager')) {
    return res.status(403).json({ error: 'Administrator or Lead Operator privileges required to reset the demo network.' });
  }
  seedSimulatedBengaluruNetwork(true);
  writeAuditLog(actorUserId, 'admin.reset_demo', 'system', 'demo-network', { preservedRealData: true }, 1);
  res.json({ reset: true, message: 'Simulated Bengaluru demo network restored cleanly.' });
});

app.post('/api/ask', async (req, res) => {
  const { query, userId } = req.body as { query: string; userId?: string };
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Please enter a question.' });
  }
  const result = await handleAskAccessRoute(query, userId || 'user-aarav');
  res.json(result);
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AccessRoute server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
