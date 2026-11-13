import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'accessroute.db');

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('passenger', 'operator', 'admin')),
      avatar_url TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'English (India)',
      step_free INTEGER NOT NULL DEFAULT 1,
      avoid_stairs INTEGER NOT NULL DEFAULT 1,
      wheelchair_accessible INTEGER NOT NULL DEFAULT 1,
      max_walking_m INTEGER NOT NULL DEFAULT 800,
      prefer_fewer_transfers INTEGER NOT NULL DEFAULT 1,
      audio_instructions INTEGER NOT NULL DEFAULT 1,
      visual_instructions INTEGER NOT NULL DEFAULT 1,
      simplified_guidance INTEGER NOT NULL DEFAULT 0,
      optional_accessibility_notes TEXT NOT NULL DEFAULT '',
      high_contrast INTEGER NOT NULL DEFAULT 0,
      large_text INTEGER NOT NULL DEFAULT 0,
      reduced_motion INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'technician')),
      title TEXT NOT NULL,
      can_verify INTEGER NOT NULL DEFAULT 1,
      can_resolve INTEGER NOT NULL DEFAULT 1,
      can_publish_maps INTEGER NOT NULL DEFAULT 1,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      published INTEGER NOT NULL DEFAULT 1,
      qr_code_token TEXT UNIQUE NOT NULL,
      updated_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      level_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      map_version_id TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS map_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      venue_id TEXT REFERENCES venues(id) ON DELETE CASCADE,
      floor_id TEXT REFERENCES floors(id) ON DELETE CASCADE,
      x_norm REAL,
      y_norm REAL,
      wheelchair_accessible INTEGER NOT NULL DEFAULT 1,
      step_free INTEGER NOT NULL DEFAULT 1,
      has_tactile_paving INTEGER NOT NULL DEFAULT 0,
      door_width_cm INTEGER,
      operational_status TEXT NOT NULL DEFAULT 'operational',
      verification_status TEXT NOT NULL DEFAULT 'verified',
      qr_landmark_code TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accessibility_summary TEXT NOT NULL,
      operational_status TEXT NOT NULL DEFAULT 'operational',
      verification_status TEXT NOT NULL DEFAULT 'verified',
      data_source TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
      primary_node_id TEXT REFERENCES map_nodes(id) ON DELETE SET NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
      floor_id TEXT REFERENCES floors(id) ON DELETE SET NULL,
      node_id TEXT REFERENCES map_nodes(id) ON DELETE SET NULL,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      operational_status TEXT NOT NULL DEFAULT 'operational',
      verification_status TEXT NOT NULL DEFAULT 'verified',
      accessibility_notes TEXT NOT NULL,
      data_source TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS map_edges (
      id TEXT PRIMARY KEY,
      from_node_id TEXT NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
      to_node_id TEXT NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
      bidirectional INTEGER NOT NULL DEFAULT 1,
      distance_m REAL NOT NULL,
      estimated_seconds INTEGER NOT NULL,
      edge_type TEXT NOT NULL,
      has_stairs INTEGER NOT NULL DEFAULT 0,
      step_free INTEGER NOT NULL DEFAULT 1,
      wheelchair_accessible INTEGER NOT NULL DEFAULT 1,
      max_slope_pct REAL NOT NULL DEFAULT 2.0,
      surface_quality TEXT NOT NULL DEFAULT 'smooth',
      width_cm INTEGER NOT NULL DEFAULT 180,
      operational_status TEXT NOT NULL DEFAULT 'operational',
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      report_code TEXT UNIQUE NOT NULL,
      reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved', 'reopened')),
      asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      photo_data_url TEXT,
      assigned_operator_id TEXT REFERENCES operators(id) ON DELETE SET NULL,
      resolution_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS incident_updates (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin_label TEXT NOT NULL,
      origin_node_id TEXT REFERENCES map_nodes(id) ON DELETE SET NULL,
      destination_label TEXT NOT NULL,
      destination_node_id TEXT REFERENCES map_nodes(id) ON DELETE SET NULL,
      route_mode TEXT NOT NULL,
      distance_m REAL NOT NULL,
      duration_min INTEGER NOT NULL,
      walking_m REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS saved_places (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      route_json TEXT,
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      related_incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS map_versions (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
      snapshot_json TEXT NOT NULL,
      published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_places_category ON places(category);
    CREATE INDEX IF NOT EXISTS idx_nodes_venue_floor ON map_nodes(venue_id, floor_id);
    CREATE INDEX IF NOT EXISTS idx_edges_from_to ON map_edges(from_node_id, to_node_id);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(operational_status, asset_type);
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, asset_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
  `);
}

export function seedSimulatedBengaluruNetwork(forceReset = false) {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM places WHERE is_simulated = 1').get() as { cnt: number };
  if (existing.cnt > 0 && !forceReset) {
    return;
  }

  const now = new Date().toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

  const tx = db.transaction(() => {
    if (forceReset) {
      // Delete only simulated records so real user-created records remain intact
      db.prepare('DELETE FROM audit_logs WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM map_versions WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM notifications WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM saved_places WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM journeys WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM incident_updates WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM incidents WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM map_edges WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM assets WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM places WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM map_nodes WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM floors WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM venues WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM operators WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM organisations WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM profiles WHERE is_simulated = 1').run();
      db.prepare('DELETE FROM users WHERE is_simulated = 1').run();
    }

    // 1. Organisations (2 simulated Bengaluru transit & civic orgs)
    const insertOrg = db.prepare(`INSERT OR IGNORE INTO organisations (id, name, type, contact_email, verified, is_simulated) VALUES (?, ?, ?, ?, 1, 1)`);
    insertOrg.run('org-bmrcl', 'BMRCL Accessibility Operations (Simulated)', 'Transit Authority', 'access@bmrcl-demo.in');
    insertOrg.run('org-civic', 'Bengaluru Civic Venue Network (Simulated)', 'Civic & Hospital Venues', 'facilities@civicblr-demo.in');

    // 2. Users (10 passenger profiles + 5 operators)
    const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id, email, name, role, avatar_url, is_simulated) VALUES (?, ?, ?, ?, ?, 1)`);
    const insertProfile = db.prepare(`
      INSERT OR IGNORE INTO profiles (
        user_id, display_name, language, step_free, avoid_stairs, wheelchair_accessible,
        max_walking_m, prefer_fewer_transfers, audio_instructions, visual_instructions,
        simplified_guidance, optional_accessibility_notes, high_contrast, large_text, reduced_motion, updated_at, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const passengers: Array<[string, string, string, number, number, number, number, string]> = [
      ['user-aarav', 'aarav.nair@demo.accessroute', 'Aarav Nair', 1, 1, 1, 1200, 'Power wheelchair user · Prefers smooth ramps & wide lifts'],
      ['user-meera', 'meera.rao@demo.accessroute', 'Meera Rao', 1, 1, 0, 600, 'Senior commuter · Avoids long walks and steep slopes'],
      ['user-rohan', 'rohan.k@demo.accessroute', 'Rohan Kulkarni', 0, 0, 0, 2000, 'Low vision commuter · Prefers tactile paving & audio guidance'],
      ['user-ananya', 'ananya.s@demo.accessroute', 'Ananya Sharma', 1, 1, 1, 900, 'Manual wheelchair commuter · Needs 90cm+ door clearances'],
      ['user-vikram', 'vikram.d@demo.accessroute', 'Vikram Deshmukh', 1, 1, 0, 500, 'Post-surgery knee recovery · Step-free transfers required'],
      ['user-lakshmi', 'lakshmi.v@demo.accessroute', 'Lakshmi Venkat', 1, 0, 0, 800, 'Travelling with twin stroller · Prefers concourse lifts'],
      ['user-kabir', 'kabir.m@demo.accessroute', 'Kabir Mehta', 0, 1, 0, 1500, 'Deaf commuter · Visual & haptic turn alerts enabled'],
      ['user-divya', 'divya.n@demo.accessroute', 'Divya Nambiar', 1, 1, 1, 1000, 'Electric mobility scooter · Needs curb-cut crossings'],
      ['user-arjun', 'arjun.p@demo.accessroute', 'Arjun Patel', 0, 0, 0, 1800, 'Cognitive clarity mode · Simplified instructions preferred'],
      ['user-sana', 'sana.f@demo.accessroute', 'Sana Fatima', 1, 1, 0, 700, 'Temporary ankle cast · Avoids stairs and uneven cobbles'],
    ];

    for (const [id, email, name, sf, as, wc, maxW, notes] of passengers) {
      insertUser.run(id, email, name, 'passenger', null);
      insertProfile.run(
        id,
        name,
        'English (India)',
        sf,
        as,
        wc,
        maxW,
        1,
        id === 'user-rohan' || id === 'user-aarav' ? 1 : 0,
        1,
        id === 'user-arjun' ? 1 : 0,
        notes,
        0,
        0,
        0,
        now
      );
    }

    // 5 Mock Operators
    const operators: Array<[string, string, string, string, string, string, string]> = [
      ['op-priya', 'user-op-priya', 'priya.menon@bmrcl-demo.in', 'Priya Menon', 'org-bmrcl', 'manager', 'Accessibility Operations Lead'],
      ['op-karthik', 'user-op-karthik', 'karthik.r@bmrcl-demo.in', 'Karthik Raj', 'org-bmrcl', 'technician', 'Station Lift Engineer'],
      ['op-neha', 'user-op-neha', 'neha.iyer@civicblr-demo.in', 'Neha Iyer', 'org-civic', 'admin', 'Venue Compliance Director'],
      ['op-suresh', 'user-op-suresh', 'suresh.b@civicblr-demo.in', 'Suresh Babu', 'org-civic', 'technician', 'Hospital Facilities Coordinator'],
      ['op-farah', 'user-op-farah', 'farah.ali@bmrcl-demo.in', 'Farah Ali', 'org-bmrcl', 'admin', 'Network Accessibility Auditor'],
    ];

    const insertOp = db.prepare(`
      INSERT OR IGNORE INTO operators (id, user_id, organisation_id, role, title, can_verify, can_resolve, can_publish_maps, is_simulated)
      VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1)
    `);

    for (const [opId, userId, email, name, orgId, role, title] of operators) {
      insertUser.run(userId, email, name, role === 'admin' ? 'admin' : 'operator', null);
      insertProfile.run(userId, name, 'English (India)', 1, 1, 0, 1200, 1, 0, 1, 0, `${title} (Simulated Operator)`, 0, 0, 0, now);
      insertOp.run(opId, userId, orgId, role, title);
    }

    // 3. Venues (2 multi-floor mapped Bengaluru venues)
    const insertVenue = db.prepare(`
      INSERT OR IGNORE INTO venues (id, name, category, address, description, lat, lng, organisation_id, published, qr_code_token, updated_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)
    `);
    insertVenue.run(
      'venue-ubcity',
      'UB City Civic & Retail Concourse (Simulated)',
      'venue',
      '24 Vittal Mallya Road, Bengaluru 560001',
      'Step-free multi-level civic plaza, atrium concourse, and skybridge with tactile guidance and accessible restrooms.',
      12.9716,
      77.5961,
      'org-civic',
      'AR-VENUE-UBCITY-2026',
      hoursAgo(2)
    );
    insertVenue.run(
      'venue-marthas',
      "St. Martha's Care & Outpatient Pavilion (Simulated)",
      'hospital',
      'Nrupathunga Road, Sampangi Rama Nagar, Bengaluru 560001',
      'Step-free outpatient medical pavilion with zero-threshold ambulance bay, dual bed-sized lifts, and accessible diagnostic wing.',
      12.9719,
      77.5866,
      'org-civic',
      'AR-VENUE-MARTHAS-2026',
      hoursAgo(4)
    );

    // Floors
    const insertFloor = db.prepare(`INSERT OR IGNORE INTO floors (id, venue_id, level_number, name, map_version_id, is_simulated) VALUES (?, ?, ?, ?, ?, 1)`);
    insertFloor.run('floor-ub-g', 'venue-ubcity', 0, 'Ground Plaza (G)', 'mv-ub-1');
    insertFloor.run('floor-ub-1', 'venue-ubcity', 1, 'Concourse Level (L1)', 'mv-ub-1');
    insertFloor.run('floor-ub-2', 'venue-ubcity', 2, 'Skybridge Terrace (L2)', 'mv-ub-1');
    insertFloor.run('floor-sm-g', 'venue-marthas', 0, 'Ground Reception (G)', 'mv-sm-1');
    insertFloor.run('floor-sm-1', 'venue-marthas', 1, 'Outpatient & Diagnostics (L1)', 'mv-sm-1');

    // 4. Graph Nodes (34 connected outdoor + indoor nodes)
    const insertNode = db.prepare(`
      INSERT OR IGNORE INTO map_nodes (
        id, node_type, name, lat, lng, venue_id, floor_id, x_norm, y_norm,
        wheelchair_accessible, step_free, has_tactile_paving, door_width_cm,
        operational_status, verification_status, qr_landmark_code, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    // Outdoor transit & street network nodes (16 nodes)
    const outdoorNodes: Array<[string, string, string, number, number, number, number, number, string, string]> = [
      ['node-mg-street', 'outdoor_junction', 'MG Road Metro Street Plaza', 12.9754, 77.6062, 1, 1, 1, 'operational', 'verified'],
      ['node-mg-lift-top', 'lift', 'MG Road Metro Concourse Lift', 12.9756, 77.6066, 1, 1, 1, 'operational', 'verified'],
      ['node-mg-stairs', 'stairs', 'MG Road Footbridge Stairs', 12.9755, 77.6060, 0, 0, 0, 'operational', 'verified'],
      ['node-mg-platform', 'station_gate', 'MG Road Metro Concourse & Platform', 12.9757, 77.6069, 1, 1, 1, 'operational', 'verified'],
      ['node-mg-bus', 'bus_stop', 'MG Road Anil Kumble Bus Bay', 12.9750, 77.6048, 1, 1, 1, 'operational', 'verified'],
      ['node-anil-ramp', 'ramp', 'Anil Kumble Circle Curb Ramp', 12.9749, 77.6022, 1, 1, 1, 'operational', 'verified'],
      ['node-stmarks-cross', 'outdoor_junction', "St. Mark's Road Tactile Crossing", 12.9734, 77.5998, 1, 1, 1, 'operational', 'verified'],
      ['node-cubbon-platform', 'station_gate', 'Cubbon Park Metro Platform', 12.9809, 77.5975, 1, 1, 1, 'operational', 'verified'],
      ['node-cubbon-lift', 'lift', 'Cubbon Park Metro Lift B', 12.9806, 77.5973, 1, 1, 1, 'operational', 'verified'],
      ['node-cubbon-toilet', 'toilet', 'Cubbon Park Accessible Restroom', 12.9776, 77.5968, 1, 1, 1, 'operational', 'verified'],
      ['node-kasturba-jct', 'outdoor_junction', 'Kasturba Road & Queen Statue Junction', 12.9742, 77.5964, 1, 1, 1, 'operational', 'verified'],
      ['node-ub-parking', 'parking_bay', 'UB City Accessible Parking Bay', 12.9711, 77.5955, 1, 1, 1, 'operational', 'verified'],
      ['node-central-college', 'station_gate', 'Sir M. Visvesvaraya Metro Station', 12.9746, 77.5841, 1, 1, 1, 'operational', 'verified'],
      ['node-corp-bus', 'bus_stop', 'Corporation Circle Accessible Bus Stop', 12.9689, 77.5877, 1, 1, 0, 'operational', 'unverified'],
      ['node-bowring-hosp', 'hospital_gate', 'Bowring & Lady Curzon Hospital Gate', 12.9822, 77.6033, 1, 1, 1, 'operational', 'verified'],
      ['node-majestic', 'station_gate', 'Kempegowda (Majestic) Metro Interchange', 12.9757, 77.5728, 1, 1, 1, 'operational', 'verified'],
    ];

    for (const [id, type, name, lat, lng, wc, sf, tp, opSt, verSt] of outdoorNodes) {
      insertNode.run(id, type, name, lat, lng, null, null, null, null, wc, sf, tp, 180, opSt, verSt, null);
    }

    // UB City Indoor Nodes (10 nodes across G, L1, L2)
    const ubIndoorNodes: Array<[string, string, string, number, number, string, number, number, number, number, string | null]> = [
      ['node-ub-ent-north', 'entrance', 'UB City North Step-Free Entrance', 12.9720, 77.5961, 'floor-ub-g', 0.50, 0.16, 1, 1, 'AR-QR-UB-NORTH'],
      ['node-ub-atrium-g', 'landmark', 'UB City Central Atrium Desk (G)', 12.9717, 77.5961, 'floor-ub-g', 0.50, 0.50, 1, 1, 'AR-QR-UB-ATRIUM'],
      ['node-ub-ramp-g', 'ramp', 'UB City Piazza Ramp (1:14)', 12.9715, 77.5958, 'floor-ub-g', 0.22, 0.62, 1, 1, null],
      ['node-ub-lift-g', 'lift', 'UB City Atrium Glass Lift (G)', 12.9716, 77.5963, 'floor-ub-g', 0.78, 0.50, 1, 1, 'AR-QR-UB-LIFT-G'],
      ['node-ub-stairs-g', 'stairs', 'UB City Grand Staircase (G)', 12.9715, 77.5962, 'floor-ub-g', 0.64, 0.76, 0, 0, null],
      ['node-ub-lift-1', 'lift', 'UB City Atrium Glass Lift (L1)', 12.9716, 77.5963, 'floor-ub-1', 0.78, 0.50, 1, 1, 'AR-QR-UB-LIFT-1'],
      ['node-ub-corridor-1', 'corridor', 'Concourse East Accessible Corridor (L1)', 12.9717, 77.5961, 'floor-ub-1', 0.48, 0.48, 1, 1, null],
      ['node-ub-toilet-1', 'toilet', 'UB City Accessible Restroom (L1)', 12.9718, 77.5959, 'floor-ub-1', 0.22, 0.34, 1, 1, 'AR-QR-UB-TOILET-1'],
      ['node-ub-lift-2', 'lift', 'UB City Atrium Glass Lift (L2)', 12.9716, 77.5963, 'floor-ub-2', 0.78, 0.50, 1, 1, null],
      ['node-ub-skybridge-2', 'exit', 'UB City Skybridge Terrace Lounge (L2)', 12.9717, 77.5960, 'floor-ub-2', 0.34, 0.48, 1, 1, 'AR-QR-UB-SKY-2'],
    ];

    for (const [id, type, name, lat, lng, floorId, xn, yn, wc, sf, qr] of ubIndoorNodes) {
      insertNode.run(id, type, name, lat, lng, 'venue-ubcity', floorId, xn, yn, wc, sf, 1, wc ? 120 : 90, 'operational', 'verified', qr);
    }

    // St. Martha's Indoor Nodes (8 nodes across G, L1)
    const smIndoorNodes: Array<[string, string, string, number, number, string, number, number, number, number, string | null]> = [
      ['node-sm-ent-main', 'entrance', "St. Martha's Zero-Threshold Gate", 12.9721, 77.5865, 'floor-sm-g', 0.50, 0.16, 1, 1, 'AR-QR-SM-GATE'],
      ['node-sm-lobby-g', 'landmark', 'Triage & Reception Lobby (G)', 12.9719, 77.5866, 'floor-sm-g', 0.50, 0.48, 1, 1, 'AR-QR-SM-LOBBY'],
      ['node-sm-toilet-g', 'toilet', 'Ground Accessible Washroom (G)', 12.9718, 77.5864, 'floor-sm-g', 0.22, 0.54, 1, 1, null],
      ['node-sm-lift-g', 'lift', 'Outpatient Bed-Size Lift (G)', 12.9718, 77.5868, 'floor-sm-g', 0.78, 0.50, 1, 1, 'AR-QR-SM-LIFT-G'],
      ['node-sm-stairs-g', 'stairs', 'East Wing Stairwell (G)', 12.9717, 77.5867, 'floor-sm-g', 0.65, 0.78, 0, 0, null],
      ['node-sm-lift-1', 'lift', 'Outpatient Bed-Size Lift (L1)', 12.9718, 77.5868, 'floor-sm-1', 0.78, 0.50, 1, 1, 'AR-QR-SM-LIFT-1'],
      ['node-sm-corridor-1', 'corridor', 'Diagnostics Accessible Corridor (L1)', 12.9719, 77.5866, 'floor-sm-1', 0.48, 0.48, 1, 1, null],
      ['node-sm-diag-1', 'landmark', 'Radiology & Mobility Clinic (L1)', 12.9720, 77.5865, 'floor-sm-1', 0.24, 0.36, 1, 1, 'AR-QR-SM-CLINIC'],
    ];

    for (const [id, type, name, lat, lng, floorId, xn, yn, wc, sf, qr] of smIndoorNodes) {
      insertNode.run(id, type, name, lat, lng, 'venue-marthas', floorId, xn, yn, wc, sf, 1, wc ? 140 : 100, 'operational', 'verified', qr);
    }

    // 5. Places (displayed as markers & search destinations on Explore)
    const insertPlace = db.prepare(`
      INSERT OR IGNORE INTO places (
        id, name, category, address, lat, lng, accessibility_summary,
        operational_status, verification_status, data_source, last_updated,
        organisation_id, venue_id, primary_node_id, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const placesData: Array<[string, string, string, string, number, number, string, string, string, string, string, string | null, string | null, string]> = [
      ['place-mg-metro', 'MG Road Metro Station', 'station', 'MG Road, Anil Kumble Circle, Bengaluru', 12.9756, 77.6066, 'Step-free concourse lift, tactile guideways, wide AFC fare gates (100cm).', 'operational', 'verified', 'BMRCL Accessibility Registry (Simulated)', hoursAgo(1), 'org-bmrcl', null, 'node-mg-street'],
      ['place-cubbon-metro', 'Cubbon Park Metro Station', 'station', 'Minsk Square, Cubbon Park, Bengaluru', 12.9809, 77.5975, 'Dual street-to-platform lifts, tactile paving, accessible restroom.', 'operational', 'verified', 'BMRCL Accessibility Registry (Simulated)', hoursAgo(2), 'org-bmrcl', null, 'node-cubbon-lift'],
      ['place-central-metro', 'Sir M. Visvesvaraya Metro Station', 'station', 'Central College, Ambedkar Veedhi, Bengaluru', 12.9746, 77.5841, 'Step-free lift access from K.R. Circle gate to Purple Line platform.', 'operational', 'verified', 'BMRCL Accessibility Registry (Simulated)', hoursAgo(3), 'org-bmrcl', null, 'node-central-college'],
      ['place-majestic-metro', 'Kempegowda (Majestic) Interchange', 'station', 'Tank Bund Road, Majestic, Bengaluru', 12.9757, 77.5728, 'Green & Purple line interchange with dedicated transfer lifts and help desk.', 'operational', 'verified', 'BMRCL Accessibility Registry (Simulated)', hoursAgo(2), 'org-bmrcl', null, 'node-majestic'],
      ['place-ubcity', 'UB City Civic & Retail Concourse', 'venue', '24 Vittal Mallya Road, Bengaluru', 12.9716, 77.5961, 'Mapped 3-floor indoor venue · Step-free atrium, ramps, lifts, accessible restrooms.', 'operational', 'verified', 'Bengaluru Civic Venue Network (Simulated)', hoursAgo(1), 'org-civic', 'venue-ubcity', 'node-ub-ent-north'],
      ['place-marthas', "St. Martha's Care & Outpatient Pavilion", 'hospital', 'Nrupathunga Road, Bengaluru', 12.9719, 77.5866, 'Mapped 2-floor hospital pavilion · Zero-threshold entrance & bed-sized lifts.', 'operational', 'verified', 'Bengaluru Civic Venue Network (Simulated)', hoursAgo(3), 'org-civic', 'venue-marthas', 'node-sm-ent-main'],
      ['place-bowring', 'Bowring & Lady Curzon Hospital', 'hospital', 'Lady Curzon Road, Shivajinagar, Bengaluru', 12.9822, 77.6033, 'Ramped emergency entry and wheelchair drop-off bay; indoor map pending verification.', 'operational', 'unverified', 'Community Civic Audit (Simulated)', hoursAgo(14), 'org-civic', null, 'node-bowring-hosp'],
      ['place-mg-bus', 'MG Road Anil Kumble Bus Bay', 'bus_stop', 'MG Road, Bengaluru', 12.9750, 77.6048, 'Raised boarding kerb compatible with low-floor BMTC Volvo buses.', 'operational', 'verified', 'BMTC Low-Floor Feed (Simulated)', hoursAgo(5), 'org-bmrcl', null, 'node-mg-bus'],
      ['place-corp-bus', 'Corporation Circle Bus Stop', 'bus_stop', 'Nrupathunga Road, Bengaluru', 12.9689, 77.5877, 'Kerb height partially unknown; tactile strips unverified.', 'unknown', 'unknown', 'Legacy Municipal Survey (Simulated)', hoursAgo(48), null, null, 'node-corp-bus'],
      ['place-cubbon-toilet', 'Cubbon Park Accessible Restroom', 'toilet', 'Kasturba Road Gate, Cubbon Park, Bengaluru', 12.9776, 77.5968, 'Ground-level step-free universal toilet with grab rails & 110cm sliding door.', 'operational', 'verified', 'BBMP Civic Facilities (Simulated)', hoursAgo(6), 'org-civic', null, 'node-cubbon-toilet'],
      ['place-ub-parking', 'UB City Accessible Parking Bay', 'parking', 'Vittal Mallya Road West Gate, Bengaluru', 12.9711, 77.5955, '4 wide-transfer bays (360cm) directly connected to Piazza Ramp.', 'operational', 'verified', 'Bengaluru Civic Venue Network (Simulated)', hoursAgo(2), 'org-civic', 'venue-ubcity', 'node-ub-parking'],
    ];

    for (const p of placesData) {
      insertPlace.run(...p);
    }

    // 6. Infrastructure Assets (16 assets across stations, venues, streets)
    const insertAsset = db.prepare(`
      INSERT OR IGNORE INTO assets (
        id, name, asset_type, place_id, venue_id, floor_id, node_id, organisation_id,
        lat, lng, operational_status, verification_status, accessibility_notes, data_source, last_updated, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const assetsData: Array<[string, string, string, string | null, string | null, string | null, string, string | null, number, number, string, string, string, string, string]> = [
      ['asset-mg-lift', 'MG Road Metro Concourse Lift', 'lift', 'place-mg-metro', null, null, 'node-mg-lift-top', 'org-bmrcl', 12.9756, 77.6066, 'operational', 'verified', '16-passenger lift, braille buttons, 110cm door width, audio floor chime.', 'BMRCL Telemetry (Simulated)', hoursAgo(1)],
      ['asset-cubbon-lift', 'Cubbon Park Metro Lift B', 'lift', 'place-cubbon-metro', null, null, 'node-cubbon-lift', 'org-bmrcl', 12.9806, 77.5973, 'operational', 'verified', 'Step-free lift linking Minsk Square sidewalk to concourse.', 'BMRCL Telemetry (Simulated)', hoursAgo(2)],
      ['asset-central-lift', 'Central College Gate Lift', 'lift', 'place-central-metro', null, null, 'node-central-college', 'org-bmrcl', 12.9746, 77.5841, 'operational', 'verified', 'Operational step-free street-to-concourse lift.', 'BMRCL Telemetry (Simulated)', hoursAgo(3)],
      ['asset-majestic-lift', 'Majestic Interchange Transfer Lift', 'lift', 'place-majestic-metro', null, null, 'node-majestic', 'org-bmrcl', 12.9757, 77.5728, 'operational', 'verified', 'Connects Purple Line and Green Line concourses.', 'BMRCL Telemetry (Simulated)', hoursAgo(2)],
      ['asset-ub-lift', 'UB City Atrium Glass Lift', 'lift', 'place-ubcity', 'venue-ubcity', 'floor-ub-g', 'node-ub-lift-g', 'org-civic', 12.9716, 77.5963, 'operational', 'verified', 'Serves G, L1, L2 with voice announcement and 120cm wide doors.', 'Venue Facility Feed (Simulated)', hoursAgo(1)],
      ['asset-sm-lift', "St. Martha's Outpatient Bed-Size Lift", 'lift', 'place-marthas', 'venue-marthas', 'floor-sm-g', 'node-sm-lift-g', 'org-civic', 12.9718, 77.5868, 'operational', 'verified', 'Wide medical stretcher & power wheelchair lift serving G and L1.', 'Hospital Ops (Simulated)', hoursAgo(3)],
      ['asset-anil-ramp', 'Anil Kumble Circle Curb Ramp', 'ramp', 'place-mg-bus', null, null, 'node-anil-ramp', 'org-bmrcl', 12.9749, 77.6022, 'operational', 'verified', '1:15 concrete ramp with tactile warning pavers.', 'BBMP Audit (Simulated)', hoursAgo(6)],
      ['asset-ub-ramp', 'UB City Piazza Entry Ramp', 'ramp', 'place-ubcity', 'venue-ubcity', 'floor-ub-g', 'node-ub-ramp-g', 'org-civic', 12.9715, 77.5958, 'operational', 'verified', '1:14 granite ramp with dual stainless handrails.', 'Venue Facility Feed (Simulated)', hoursAgo(2)],
      ['asset-stmarks-cross', "St. Mark's Road Audible Crossing", 'crossing', null, null, null, 'node-stmarks-cross', 'org-bmrcl', 12.9734, 77.5998, 'operational', 'verified', 'Pelican crossing with audible chirp and flush kerb cuts.', 'Traffic Mobility Dept (Simulated)', hoursAgo(5)],
      ['asset-kasturba-cross', 'Kasturba Road Tactile Crossing', 'crossing', null, null, null, 'node-kasturba-jct', 'org-civic', 12.9742, 77.5964, 'degraded', 'unverified', 'Southbound kerb cut steep; audio signal intermittent.', 'Community Audit (Simulated)', hoursAgo(18)],
      ['asset-cubbon-toilet', 'Cubbon Park Accessible Toilet', 'toilet', 'place-cubbon-toilet', null, null, 'node-cubbon-toilet', 'org-civic', 12.9776, 77.5968, 'operational', 'verified', 'Zero-step entry, emergency pull cord, grab rails.', 'BBMP Civic Facilities (Simulated)', hoursAgo(4)],
      ['asset-ub-toilet', 'UB City L1 Universal Restroom', 'toilet', 'place-ubcity', 'venue-ubcity', 'floor-ub-1', 'node-ub-toilet-1', 'org-civic', 12.9718, 77.5959, 'operational', 'verified', 'Wheelchair turning radius 165cm, automatic door.', 'Venue Facility Feed (Simulated)', hoursAgo(2)],
      ['asset-sm-toilet', "St. Martha's Ground Accessible Washroom", 'toilet', 'place-marthas', 'venue-marthas', 'floor-sm-g', 'node-sm-toilet-g', 'org-civic', 12.9718, 77.5864, 'operational', 'verified', 'Step-free washroom adjacent to main triage lobby.', 'Hospital Ops (Simulated)', hoursAgo(4)],
      ['asset-ub-parking', 'UB City Wide Accessible Parking Bays', 'parking_bay', 'place-ub-parking', 'venue-ubcity', 'floor-ub-g', 'node-ub-parking', 'org-civic', 12.9711, 77.5955, 'operational', 'verified', '4 marked bays with 140cm hatched transfer zones.', 'Venue Facility Feed (Simulated)', hoursAgo(2)],
      ['asset-ub-entrance', 'UB City North Step-Free Entrance', 'entrance', 'place-ubcity', 'venue-ubcity', 'floor-ub-g', 'node-ub-ent-north', 'org-civic', 12.9720, 77.5961, 'operational', 'verified', 'Automatic sliding doors (160cm clear width).', 'Venue Facility Feed (Simulated)', hoursAgo(1)],
      ['asset-corp-tactile', 'Corporation Circle Tactile Path', 'tactile_path', 'place-corp-bus', null, null, 'node-corp-bus', null, 12.9689, 77.5877, 'unknown', 'unknown', 'Surface pavers require post-roadworks verification.', 'Legacy Survey (Simulated)', hoursAgo(48)],
    ];

    for (const a of assetsData) {
      insertAsset.run(...a);
    }

    // 7. Graph Edges (44 connected outdoor & indoor edges)
    const insertEdge = db.prepare(`
      INSERT OR IGNORE INTO map_edges (
        id, from_node_id, to_node_id, bidirectional, distance_m, estimated_seconds,
        edge_type, has_stairs, step_free, wheelchair_accessible, max_slope_pct,
        surface_quality, width_cm, operational_status, asset_id, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const edgesData: Array<[string, string, string, number, number, number, string, number, number, number, number, string, number, string, string | null]> = [
      // MG Road Metro Entry Options (Lift vs Stairs)
      ['edge-mg-street-lift', 'node-mg-street', 'node-mg-lift-top', 1, 45, 45, 'sidewalk', 0, 1, 1, 1.5, 'smooth', 220, 'operational', null],
      ['edge-mg-lift-platform', 'node-mg-lift-top', 'node-mg-platform', 1, 35, 55, 'lift_shaft', 0, 1, 1, 0.0, 'smooth', 110, 'operational', 'asset-mg-lift'],
      ['edge-mg-street-stairs', 'node-mg-street', 'node-mg-stairs', 1, 30, 25, 'staircase', 1, 0, 0, 32.0, 'paved', 180, 'operational', null],
      ['edge-mg-stairs-platform', 'node-mg-stairs', 'node-mg-platform', 1, 40, 35, 'staircase', 1, 0, 0, 32.0, 'paved', 180, 'operational', null],

      // Purple Line Metro Links (fast, step-free transit)
      ['edge-metro-mg-cubbon', 'node-mg-platform', 'node-cubbon-platform', 1, 1150, 150, 'metro_line', 0, 1, 1, 0.0, 'smooth', 240, 'operational', null],
      ['edge-metro-cubbon-central', 'node-cubbon-platform', 'node-central-college', 1, 1520, 180, 'metro_line', 0, 1, 1, 0.0, 'smooth', 240, 'operational', null],
      ['edge-metro-central-majestic', 'node-central-college', 'node-majestic', 1, 1280, 160, 'metro_line', 0, 1, 1, 0.0, 'smooth', 240, 'operational', null],

      // Cubbon Park Station & Kasturba Road Step-Free Corridor
      ['edge-cubbon-plat-lift', 'node-cubbon-platform', 'node-cubbon-lift', 1, 45, 55, 'lift_shaft', 0, 1, 1, 0.0, 'smooth', 110, 'operational', 'asset-cubbon-lift'],
      ['edge-cubbon-lift-toilet', 'node-cubbon-lift', 'node-cubbon-toilet', 1, 340, 270, 'sidewalk', 0, 1, 1, 2.0, 'smooth', 200, 'operational', null],
      ['edge-cubbon-toilet-kasturba', 'node-cubbon-toilet', 'node-kasturba-jct', 1, 380, 300, 'sidewalk', 0, 1, 1, 2.5, 'paved', 180, 'operational', 'asset-kasturba-cross'],
      ['edge-kasturba-ub-north', 'node-kasturba-jct', 'node-ub-ent-north', 1, 250, 200, 'sidewalk', 0, 1, 1, 2.0, 'smooth', 200, 'operational', 'asset-ub-entrance'],

      // Surface All-Walk Step-Free Corridor (MG Road -> Anil Kumble -> St Marks -> Kasturba -> UB City)
      ['edge-mg-street-bus', 'node-mg-street', 'node-mg-bus', 1, 160, 130, 'sidewalk', 0, 1, 1, 1.8, 'smooth', 220, 'operational', null],
      ['edge-mg-bus-anil', 'node-mg-bus', 'node-anil-ramp', 1, 285, 230, 'ramp', 0, 1, 1, 5.5, 'smooth', 180, 'operational', 'asset-anil-ramp'],
      ['edge-anil-stmarks', 'node-anil-ramp', 'node-stmarks-cross', 1, 310, 250, 'crossing', 0, 1, 1, 2.0, 'smooth', 220, 'operational', 'asset-stmarks-cross'],
      ['edge-stmarks-kasturba', 'node-stmarks-cross', 'node-kasturba-jct', 1, 375, 300, 'sidewalk', 0, 1, 1, 2.5, 'paved', 190, 'operational', null],

      // Hospital & Bus Links
      ['edge-cubbon-bowring', 'node-cubbon-lift', 'node-bowring-hosp', 1, 680, 540, 'sidewalk', 0, 1, 1, 3.0, 'unknown', 150, 'operational', null],
      ['edge-mg-bus-cubbon-bus', 'node-mg-bus', 'node-bowring-hosp', 1, 820, 320, 'bus_link', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],
      ['edge-ub-parking-ramp', 'node-ub-parking', 'node-ub-ramp-g', 1, 60, 55, 'sidewalk', 0, 1, 1, 2.0, 'smooth', 220, 'operational', 'asset-ub-parking'],
      ['edge-kasturba-marthas', 'node-kasturba-jct', 'node-sm-ent-main', 1, 1080, 860, 'sidewalk', 0, 1, 1, 3.0, 'paved', 175, 'operational', null],
      ['edge-central-marthas', 'node-central-college', 'node-sm-ent-main', 1, 390, 310, 'sidewalk', 0, 1, 1, 2.2, 'smooth', 200, 'operational', null],
      ['edge-sm-corp-bus', 'node-sm-ent-main', 'node-corp-bus', 1, 360, 290, 'sidewalk', 0, 1, 1, 3.5, 'unknown', 140, 'operational', 'asset-corp-tactile'],
      ['edge-corp-ub', 'node-corp-bus', 'node-ub-parking', 1, 890, 710, 'sidewalk', 0, 1, 1, 3.2, 'paved', 160, 'operational', null],

      // UB City Indoor Graph (G, L1, L2) — 12 edges
      ['edge-ub-ent-atrium', 'node-ub-ent-north', 'node-ub-atrium-g', 1, 35, 30, 'entrance_link', 0, 1, 1, 0.5, 'smooth', 240, 'operational', 'asset-ub-entrance'],
      ['edge-ub-ramp-atrium', 'node-ub-ramp-g', 'node-ub-atrium-g', 1, 42, 40, 'ramp', 0, 1, 1, 6.5, 'smooth', 180, 'operational', 'asset-ub-ramp'],
      ['edge-ub-atrium-liftg', 'node-ub-atrium-g', 'node-ub-lift-g', 1, 28, 25, 'corridor', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],
      ['edge-ub-atrium-stairsg', 'node-ub-atrium-g', 'node-ub-stairs-g', 1, 26, 22, 'staircase', 1, 0, 0, 30.0, 'smooth', 180, 'operational', null],
      ['edge-ub-lift-g-1', 'node-ub-lift-g', 'node-ub-lift-1', 1, 12, 35, 'lift_shaft', 0, 1, 1, 0.0, 'smooth', 120, 'operational', 'asset-ub-lift'],
      ['edge-ub-stairs-g-1', 'node-ub-stairs-g', 'node-ub-corridor-1', 1, 24, 30, 'staircase', 1, 0, 0, 30.0, 'smooth', 160, 'operational', null],
      ['edge-ub-lift1-corr1', 'node-ub-lift-1', 'node-ub-corridor-1', 1, 30, 28, 'corridor', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],
      ['edge-ub-corr1-toilet1', 'node-ub-corridor-1', 'node-ub-toilet-1', 1, 28, 25, 'corridor', 0, 1, 1, 0.0, 'smooth', 165, 'operational', 'asset-ub-toilet'],
      ['edge-ub-lift-1-2', 'node-ub-lift-1', 'node-ub-lift-2', 1, 12, 35, 'lift_shaft', 0, 1, 1, 0.0, 'smooth', 120, 'operational', 'asset-ub-lift'],
      ['edge-ub-lift2-sky2', 'node-ub-lift-2', 'node-ub-skybridge-2', 1, 40, 35, 'corridor', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],

      // St. Martha's Indoor Graph (G, L1) — 10 edges
      ['edge-sm-ent-lobby', 'node-sm-ent-main', 'node-sm-lobby-g', 1, 32, 28, 'entrance_link', 0, 1, 1, 0.5, 'smooth', 240, 'operational', null],
      ['edge-sm-lobby-toilet', 'node-sm-lobby-g', 'node-sm-toilet-g', 1, 26, 24, 'corridor', 0, 1, 1, 0.0, 'smooth', 180, 'operational', 'asset-sm-toilet'],
      ['edge-sm-lobby-liftg', 'node-sm-lobby-g', 'node-sm-lift-g', 1, 30, 26, 'corridor', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],
      ['edge-sm-lobby-stairsg', 'node-sm-lobby-g', 'node-sm-stairs-g', 1, 25, 22, 'staircase', 1, 0, 0, 30.0, 'smooth', 160, 'operational', null],
      ['edge-sm-lift-g-1', 'node-sm-lift-g', 'node-sm-lift-1', 1, 12, 38, 'lift_shaft', 0, 1, 1, 0.0, 'smooth', 140, 'operational', 'asset-sm-lift'],
      ['edge-sm-stairs-g-1', 'node-sm-stairs-g', 'node-sm-corridor-1', 1, 22, 28, 'staircase', 1, 0, 0, 30.0, 'smooth', 150, 'operational', null],
      ['edge-sm-lift1-corr1', 'node-sm-lift-1', 'node-sm-corridor-1', 1, 28, 25, 'corridor', 0, 1, 1, 0.0, 'smooth', 220, 'operational', null],
      ['edge-sm-corr1-diag1', 'node-sm-corridor-1', 'node-sm-diag-1', 1, 34, 30, 'corridor', 0, 1, 1, 0.0, 'smooth', 200, 'operational', null],
    ];

    for (const e of edgesData) {
      insertEdge.run(...e);
    }

    // 8. Map Versions for indoor venues
    const insertVersion = db.prepare(`
      INSERT OR IGNORE INTO map_versions (id, venue_id, version_number, status, snapshot_json, published_by_user_id, created_at, is_simulated)
      VALUES (?, ?, 1, 'published', ?, 'user-op-neha', ?, 1)
    `);
    insertVersion.run('mv-ub-1', 'venue-ubcity', JSON.stringify({ note: 'Initial published 3-floor indoor graph (Simulated)' }), hoursAgo(12));
    insertVersion.run('mv-sm-1', 'venue-marthas', JSON.stringify({ note: 'Initial published 2-floor hospital map (Simulated)' }), hoursAgo(10));

    // 9. Incidents (15 realistic simulated Bengaluru accessibility incidents + history)
    const insertIncident = db.prepare(`
      INSERT OR IGNORE INTO incidents (
        id, report_code, reporter_user_id, category, title, description, severity, status,
        asset_id, place_id, lat, lng, photo_data_url, assigned_operator_id, resolution_notes,
        created_at, updated_at, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1)
    `);
    const insertUpdate = db.prepare(`
      INSERT OR IGNORE INTO incident_updates (id, incident_id, actor_user_id, from_status, to_status, note, created_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const seedIncidents: Array<[string, string, string, string, string, string, string, string, string | null, string | null, number, number, string | null, string | null, number]> = [
      ['inc-101', 'AR-BLR-101', 'user-meera', 'Crossing problem', 'Kasturba Rd audio beacon intermittent', 'Southbound pedestrian chirp failed to sound during morning peak.', 'medium', 'in_progress', 'asset-kasturba-cross', null, 12.9742, 77.5964, 'op-karthik', 'Technician dispatched to replace relay board.', 16],
      ['inc-102', 'AR-BLR-102', 'user-rohan', 'Missing accessibility information', 'Corporation Circle kerb height unverified', 'Post-resurfacing tactile paving alignment needs field audit.', 'low', 'under_review', 'asset-corp-tactile', 'place-corp-bus', 12.9689, 77.5877, null, null, 22],
      ['inc-103', 'AR-BLR-103', 'user-aarav', 'Blocked footpath', 'Temporary barricade near Bowring Gate', 'Construction cones narrowed sidewalk to 105cm; passable with caution.', 'medium', 'verified', null, 'place-bowring', 12.9820, 77.6030, 'op-suresh', null, 10],
      ['inc-104', 'AR-BLR-104', 'user-ananya', 'Broken lift', 'Cubbon Park Lift B door sensor lag', 'Door closes slightly fast; sensor recalibrated and restored.', 'high', 'resolved', 'asset-cubbon-lift', 'place-cubbon-metro', 12.9806, 77.5973, 'op-karthik', 'Infrared curtain calibrated and dwell time extended to 8s.', 40],
      ['inc-105', 'AR-BLR-105', 'user-vikram', 'Broken ramp', 'Anil Kumble ramp joint lip', 'Minor mortar gap at ramp bottom; patched flush.', 'medium', 'resolved', 'asset-anil-ramp', 'place-mg-bus', 12.9749, 77.6022, 'op-priya', 'Asphalt bevel poured flush with street kerb.', 72],
      ['inc-106', 'AR-BLR-106', 'user-lakshmi', 'Inaccessible entrance', 'UB City South valet bollards tight', 'North Entrance remains 160cm clear; South bollards spaced for maintenance.', 'low', 'submitted', null, 'place-ubcity', 12.9713, 77.5960, null, null, 5],
      ['inc-107', 'AR-BLR-107', 'user-divya', 'Construction barrier', 'Vittal Mallya Rd utility trench plate', 'Steel trench plate installed with beveled ramps.', 'medium', 'assigned', null, 'place-ubcity', 12.9724, 77.5975, 'op-neha', null, 8],
      ['inc-108', 'AR-BLR-108', 'user-kabir', 'Crossing problem', 'MG Road visual countdown timer dim', 'LED brightness reduced on eastbound pole.', 'low', 'submitted', 'asset-stmarks-cross', null, 12.9734, 77.5998, null, null, 6],
      ['inc-109', 'AR-BLR-109', 'user-sana', 'Other', 'Cubbon Park restroom latch stiff', 'Replaced sliding latch handle with lever-style lock.', 'medium', 'resolved', 'asset-cubbon-toilet', 'place-cubbon-toilet', 12.9776, 77.5968, 'op-neha', 'Lever hardware installed and inspected.', 52],
      ['inc-110', 'AR-BLR-110', 'user-arjun', 'Missing accessibility information', 'Bowring Hospital OPD wayfinding signage', 'Requested high-contrast directional arrows at gate.', 'low', 'verified', null, 'place-bowring', 12.9822, 77.6033, 'op-suresh', null, 12],
      ['inc-111', 'AR-BLR-111', 'user-aarav', 'Broken lift', 'MG Road Lift quarterly inspection alert', 'Scheduled preventive maintenance completed cleanly.', 'high', 'resolved', 'asset-mg-lift', 'place-mg-metro', 12.9756, 77.6066, 'op-karthik', 'Brake pads and backup battery certified.', 96],
      ['inc-112', 'AR-BLR-112', 'user-meera', 'Blocked footpath', 'Fallen branch on Queen Statue walkway', 'Cleared by BBMP horticulture crew.', 'medium', 'resolved', null, null, 12.9746, 77.5966, 'op-priya', 'Pathway swept and verified 200cm clear.', 60],
      ['inc-113', 'AR-BLR-113', 'user-ananya', 'Inaccessible entrance', "St. Martha's pharmacy side door locked", 'Main Zero-Threshold Gate remains open 24/7; side door signage updated.', 'low', 'resolved', null, 'place-marthas', 12.9720, 77.5867, 'op-suresh', 'Added illuminated step-free directional sign to main gate.', 36],
      ['inc-114', 'AR-BLR-114', 'user-divya', 'Other', 'UB City Accessible Bay 2 cones', 'Delivery van temporarily encroached hatched zone; security cleared.', 'high', 'resolved', 'asset-ub-parking', 'place-ub-parking', 12.9711, 77.5955, 'op-neha', 'Security marshals assigned to bay enforcement.', 28],
      ['inc-115', 'AR-BLR-115', 'user-rohan', 'Blocked footpath', 'Tactile tile loose near Central College gate', 'Two yellow blister tiles lifted near tree pit.', 'medium', 'reopened', 'asset-central-lift', 'place-central-metro', 12.9747, 77.5843, 'op-karthik', 'Reopened after rain loosened adhesive; heavy-duty grout scheduled.', 4],
    ];

    for (const [id, code, rep, cat, title, desc, sev, st, assetId, placeId, lat, lng, opId, resNotes, hAgo] of seedIncidents) {
      const created = hoursAgo(hAgo + 2);
      const updated = hoursAgo(hAgo);
      insertIncident.run(id, code, rep, cat, title, desc, sev, st, assetId, placeId, lat, lng, opId, resNotes, created, updated);
      insertUpdate.run(`upd-${id}-1`, id, rep, null, 'submitted', 'Initial citizen accessibility report submitted.', created);
      if (st !== 'submitted') {
        insertUpdate.run(`upd-${id}-2`, id, 'user-op-priya', 'submitted', st, resNotes || `Status updated to ${st}.`, updated);
      }
    }

    // 10. Saved Places & Routes for Aarav
    const insertSaved = db.prepare(`INSERT OR IGNORE INTO saved_places (id, user_id, place_id, label, route_json, created_at, is_simulated) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    insertSaved.run('sav-1', 'user-aarav', 'place-ubcity', 'UB City Civic Concourse (Work)', JSON.stringify({ origin: 'node-mg-street', destination: 'node-ub-ent-north', mode: 'most_accessible' }), hoursAgo(30));
    insertSaved.run('sav-2', 'user-aarav', 'place-marthas', "St. Martha's Outpatient Pavilion", JSON.stringify({ origin: 'node-mg-street', destination: 'node-sm-ent-main', mode: 'most_accessible' }), hoursAgo(24));
    insertSaved.run('sav-3', 'user-aarav', 'place-cubbon-metro', 'Cubbon Park Metro Station', null, hoursAgo(12));

    // 11. Journey History for Aarav
    const insertJourney = db.prepare(`
      INSERT OR IGNORE INTO journeys (id, user_id, origin_label, origin_node_id, destination_label, destination_node_id, route_mode, distance_m, duration_min, walking_m, status, created_at, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertJourney.run('jrn-1', 'user-aarav', 'MG Road Metro Street Plaza', 'node-mg-street', 'UB City North Step-Free Entrance', 'node-ub-ent-north', 'most_accessible', 2245, 16, 1095, 'completed', hoursAgo(26));
    insertJourney.run('jrn-2', 'user-aarav', 'Cubbon Park Metro Lift B', 'node-cubbon-lift', "St. Martha's Zero-Threshold Gate", 'node-sm-ent-main', 'least_walking', 1955, 13, 435, 'completed', hoursAgo(14));

    // 12. Notifications
    const insertNotif = db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, title, message, type, related_incident_id, read, created_at, is_simulated) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`);
    insertNotif.run('notif-1', 'user-aarav', 'Kasturba Rd crossing audio intermittent', 'Visual countdown remains active; audible chirp under repair (AR-BLR-101).', 'disruption', 'inc-101', hoursAgo(3));
    insertNotif.run('notif-2', 'user-aarav', 'UB City 3-Floor Indoor Map Published', 'Step-free routes and QR landmark check-ins available for G, L1, and L2.', 'system', null, hoursAgo(12));
  });

  tx();
}
