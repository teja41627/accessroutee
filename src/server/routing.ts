import { db } from './db.ts';
import type { ComputedRoute, MapEdge, MapNode, RoutePlanResponse, RouteStep } from '../types.ts';

export interface AccessibilityConstraints {
  stepFree: boolean;
  avoidStairs: boolean;
  wheelchairAccessible: boolean;
  maxWalkingM: number;
  preferFewerTransfers: boolean;
}

interface RawNodeRow {
  id: string;
  node_type: string;
  name: string;
  lat: number;
  lng: number;
  venue_id: string | null;
  floor_id: string | null;
  x_norm: number | null;
  y_norm: number | null;
  wheelchair_accessible: number;
  step_free: number;
  has_tactile_paving: number;
  door_width_cm: number | null;
  operational_status: string;
  verification_status: string;
  qr_landmark_code: string | null;
}

interface RawEdgeRow {
  id: string;
  from_node_id: string;
  to_node_id: string;
  bidirectional: number;
  distance_m: number;
  estimated_seconds: number;
  edge_type: string;
  has_stairs: number;
  step_free: number;
  wheelchair_accessible: number;
  max_slope_pct: number;
  surface_quality: 'smooth' | 'paved' | 'cobble' | 'unknown';
  width_cm: number;
  operational_status: string;
  asset_id: string | null;
  asset_name?: string | null;
  asset_status?: string | null;
  asset_verification?: string | null;
}

function loadGraph() {
  const nodeRows = db.prepare(`SELECT * FROM map_nodes`).all() as RawNodeRow[];
  const edgeRows = db.prepare(`
    SELECT e.*, a.name as asset_name, a.operational_status as asset_status, a.verification_status as asset_verification
    FROM map_edges e
    LEFT JOIN assets a ON e.asset_id = a.id
  `).all() as RawEdgeRow[];

  const nodes = new Map<string, RawNodeRow>();
  for (const n of nodeRows) nodes.set(n.id, n);

  const adj = new Map<string, Array<{ edge: RawEdgeRow; nextNodeId: string }>>();
  for (const n of nodeRows) adj.set(n.id, []);

  for (const e of edgeRows) {
    if (adj.has(e.from_node_id)) {
      adj.get(e.from_node_id)!.push({ edge: e, nextNodeId: e.to_node_id });
    }
    if (e.bidirectional === 1 && adj.has(e.to_node_id)) {
      adj.get(e.to_node_id)!.push({ edge: e, nextNodeId: e.from_node_id });
    }
  }

  return { nodes, edgeRows, adj };
}

function isEdgeAllowed(
  edge: RawEdgeRow,
  fromNode: RawNodeRow,
  toNode: RawNodeRow,
  constraints: AccessibilityConstraints
): { allowed: boolean; reason?: string } {
  const effectiveStatus = edge.asset_status || edge.operational_status;
  if (effectiveStatus === 'unavailable' || edge.operational_status === 'unavailable') {
    return {
      allowed: false,
      reason: edge.asset_name
        ? `${edge.asset_name} is currently unavailable`
        : `Segment ${fromNode.name} to ${toNode.name} is unavailable`,
    };
  }
  if (fromNode.operational_status === 'unavailable' || toNode.operational_status === 'unavailable') {
    return {
      allowed: false,
      reason: `${toNode.operational_status === 'unavailable' ? toNode.name : fromNode.name} is unavailable`,
    };
  }
  if ((constraints.stepFree || constraints.avoidStairs) && (edge.has_stairs === 1 || edge.step_free === 0)) {
    return {
      allowed: false,
      reason: `Contains stairs (${fromNode.name} → ${toNode.name})`,
    };
  }
  if (constraints.wheelchairAccessible && (edge.wheelchair_accessible === 0 || edge.width_cm < 85)) {
    return {
      allowed: false,
      reason: `Not wheelchair-accessible (${fromNode.name} → ${toNode.name})`,
    };
  }
  return { allowed: true };
}

function edgeCost(
  edge: RawEdgeRow,
  prevEdgeType: string | null,
  mode: 'most_accessible' | 'least_walking' | 'fastest_feasible',
  constraints: AccessibilityConstraints
): number {
  const isWalking = !['metro_line', 'bus_link', 'lift_shaft'].includes(edge.edge_type);
  const isTransfer =
    prevEdgeType !== null &&
    ((prevEdgeType === 'metro_line' && edge.edge_type !== 'metro_line') ||
      (prevEdgeType !== 'metro_line' && edge.edge_type === 'metro_line') ||
      (prevEdgeType === 'bus_link' && edge.edge_type !== 'bus_link'));

  const transferPenalty = isTransfer && constraints.preferFewerTransfers ? 220 : isTransfer ? 80 : 0;
  const unknownPenalty =
    edge.surface_quality === 'unknown' || edge.asset_verification === 'unknown' ? 450 : 0;
  const degradedPenalty =
    edge.asset_status === 'degraded' || edge.asset_verification === 'unverified' ? 240 : 0;

  if (mode === 'most_accessible') {
    // Favors verified, smooth, wide, step-free corridors & lifts; strongly avoids unknown/degraded
    const slopePenalty = edge.max_slope_pct * 22;
    const widthBonus = edge.width_cm >= 180 ? -15 : 0;
    return Math.max(10, edge.estimated_seconds + slopePenalty + unknownPenalty + degradedPenalty + transferPenalty * 0.4 + widthBonus);
  }

  if (mode === 'least_walking') {
    // Strongly minimizes pedestrian walking meters, prefers metro/bus/lift
    const walkWeight = isWalking ? edge.distance_m * 3.5 : edge.estimated_seconds * 0.35;
    return Math.max(10, walkWeight + transferPenalty * 0.5 + unknownPenalty * 0.3);
  }

  // fastest_feasible
  return Math.max(10, edge.estimated_seconds + transferPenalty * 0.25 + (edge.asset_status === 'degraded' ? 45 : 0));
}

function buildInstruction(edge: RawEdgeRow, fromNode: RawNodeRow, toNode: RawNodeRow): {
  instruction: string;
  maneuver: RouteStep['maneuver'];
} {
  if (edge.edge_type === 'lift_shaft') {
    return {
      instruction: `Take ${edge.asset_name || toNode.name} (${Math.round(edge.estimated_seconds)}s step-free lift)`,
      maneuver: 'lift',
    };
  }
  if (edge.edge_type === 'metro_line') {
    return {
      instruction: `Board step-free Metro Purple Line from ${fromNode.name} to ${toNode.name}`,
      maneuver: 'transit',
    };
  }
  if (edge.edge_type === 'bus_link') {
    return {
      instruction: `Board low-floor accessible BMTC bus toward ${toNode.name}`,
      maneuver: 'transit',
    };
  }
  if (edge.edge_type === 'ramp') {
    return {
      instruction: `Use ${toNode.name} (${edge.max_slope_pct}% grade, ${edge.width_cm}cm wide) for ${Math.round(edge.distance_m)}m`,
      maneuver: 'ramp',
    };
  }
  if (edge.edge_type === 'crossing') {
    return {
      instruction: `Cross at ${toNode.name} (${Math.round(edge.distance_m)}m)`,
      maneuver: 'crossing',
    };
  }
  if (edge.edge_type === 'staircase') {
    return {
      instruction: `Take stairs via ${toNode.name} (${Math.round(edge.distance_m)}m)`,
      maneuver: 'straight',
    };
  }
  return {
    instruction: `Continue along ${edge.surface_quality === 'unknown' ? 'pathway' : `${edge.surface_quality} path`} to ${toNode.name} (${Math.round(edge.distance_m)}m)`,
    maneuver: 'straight',
  };
}

function runDijkstra(
  originId: string,
  destId: string,
  mode: 'most_accessible' | 'least_walking' | 'fastest_feasible',
  constraints: AccessibilityConstraints,
  graph: ReturnType<typeof loadGraph>,
  extraAvoidEdgeIds: Set<string> = new Set()
): ComputedRoute {
  const { nodes, adj } = graph;
  const dist = new Map<string, number>();
  const prev = new Map<string, { nodeId: string; edge: RawEdgeRow } | null>();
  const visited = new Set<string>();
  const blockedReasons: string[] = [];

  for (const id of nodes.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(originId, 0);

  while (true) {
    let u: string | null = null;
    let minVal = Infinity;
    for (const [id, d] of dist.entries()) {
      if (!visited.has(id) && d < minVal) {
        minVal = d;
        u = id;
      }
    }
    if (u === null || u === destId) break;
    visited.add(u);

    const fromNode = nodes.get(u)!;
    const prevEdgeType = prev.get(u)?.edge.edge_type ?? null;
    const neighbors = adj.get(u) || [];

    for (const { edge, nextNodeId } of neighbors) {
      if (visited.has(nextNodeId)) continue;
      if (extraAvoidEdgeIds.has(edge.id)) continue;
      const toNode = nodes.get(nextNodeId)!;
      const check = isEdgeAllowed(edge, fromNode, toNode, constraints);
      if (!check.allowed) {
        if (check.reason && !blockedReasons.includes(check.reason)) {
          blockedReasons.push(check.reason);
        }
        continue;
      }
      const alt = minVal + edgeCost(edge, prevEdgeType, mode, constraints);
      if (alt < (dist.get(nextNodeId) ?? Infinity)) {
        dist.set(nextNodeId, alt);
        prev.set(nextNodeId, { nodeId: u, edge });
      }
    }
  }

  const labelMap = {
    most_accessible: 'Most accessible',
    least_walking: 'Least walking',
    fastest_feasible: 'Fastest feasible',
  };

  if ((dist.get(destId) ?? Infinity) === Infinity) {
    return {
      mode,
      label: labelMap[mode],
      feasible: false,
      total_distance_m: 0,
      walking_distance_m: 0,
      estimated_minutes: 0,
      transfers: 0,
      accessibility_compatibility: 'Blocked',
      data_confidence: 'Verified',
      known_barriers: blockedReasons,
      unknown_disclosures: [],
      steps: [],
      geometry: [],
      node_ids: [],
      blocked_reason:
        blockedReasons.length > 0
          ? `No feasible route under your constraints: ${blockedReasons.slice(0, 2).join('; ')}.`
          : 'No connected route found between selected nodes.',
    };
  }

  // Reconstruct path
  const chain: Array<{ fromId: string; toId: string; edge: RawEdgeRow }> = [];
  let curr = destId;
  while (curr !== originId) {
    const p = prev.get(curr);
    if (!p) break;
    chain.unshift({ fromId: p.nodeId, toId: curr, edge: p.edge });
    curr = p.nodeId;
  }

  let totalDistance = 0;
  let walkingDistance = 0;
  let totalSeconds = 0;
  let transfers = 0;
  let lastTransitType: string | null = null;
  const knownBarriers: string[] = [];
  const unknownDisclosures: string[] = [];
  let hasUnverified = false;
  let hasUnknown = false;

  const steps: RouteStep[] = [];
  const geometry: [number, number][] = [];
  const nodeIds: string[] = [originId];

  for (let i = 0; i < chain.length; i++) {
    const { fromId, toId, edge } = chain[i];
    const fromNode = nodes.get(fromId)!;
    const toNode = nodes.get(toId)!;
    nodeIds.push(toId);

    totalDistance += edge.distance_m;
    totalSeconds += edge.estimated_seconds;

    const isWalking = !['metro_line', 'bus_link', 'lift_shaft'].includes(edge.edge_type);
    if (isWalking) {
      walkingDistance += edge.distance_m;
    }

    if (edge.edge_type === 'metro_line' || edge.edge_type === 'bus_link') {
      if (lastTransitType && lastTransitType !== edge.edge_type) transfers += 1;
      if (!lastTransitType && i > 0) transfers += 1;
      lastTransitType = edge.edge_type;
    }

    let warning: string | null = null;
    if (edge.surface_quality === 'unknown' || edge.asset_verification === 'unknown' || toNode.verification_status === 'unknown') {
      hasUnknown = true;
      const msg = `Unknown surface/accessibility verification near ${toNode.name}`;
      if (!unknownDisclosures.includes(msg)) unknownDisclosures.push(msg);
      warning = msg;
    } else if (edge.asset_status === 'degraded' || edge.asset_verification === 'unverified' || toNode.verification_status === 'unverified') {
      hasUnverified = true;
      const msg = edge.asset_name
        ? `${edge.asset_name} status: ${edge.asset_status || 'unverified'}`
        : `Unverified segment near ${toNode.name}`;
      if (!knownBarriers.includes(msg)) knownBarriers.push(msg);
      warning = msg;
    }

    if (edge.max_slope_pct >= 5) {
      const slopeMsg = `${edge.max_slope_pct}% ramp slope near ${toNode.name}`;
      if (!knownBarriers.includes(slopeMsg)) knownBarriers.push(slopeMsg);
    }

    const coords: [number, number][] = [
      [fromNode.lng, fromNode.lat],
      [toNode.lng, toNode.lat],
    ];
    if (geometry.length === 0) geometry.push(coords[0]);
    geometry.push(coords[1]);

    const { instruction, maneuver } = buildInstruction(edge, fromNode, toNode);

    steps.push({
      edge_id: edge.id,
      from_node_id: fromId,
      to_node_id: toId,
      from_name: fromNode.name,
      to_name: toNode.name,
      edge_type: edge.edge_type,
      instruction,
      maneuver,
      distance_m: Math.round(edge.distance_m),
      estimated_seconds: Math.round(edge.estimated_seconds),
      step_free: edge.step_free === 1,
      wheelchair_accessible: edge.wheelchair_accessible === 1,
      surface_quality: edge.surface_quality,
      floor_id: toNode.floor_id,
      coordinates: coords,
      x_norm: toNode.x_norm,
      y_norm: toNode.y_norm,
      warning,
    });
  }

  if (walkingDistance > constraints.maxWalkingM) {
    knownBarriers.push(
      `Walking distance (${Math.round(walkingDistance)}m) exceeds your ${constraints.maxWalkingM}m preference`
    );
  }

  const dataConfidence: ComputedRoute['data_confidence'] = hasUnknown
    ? 'Contains unknown data'
    : hasUnverified
    ? 'Contains unverified segments'
    : 'Verified';

  const compatibility: ComputedRoute['accessibility_compatibility'] =
    hasUnknown || walkingDistance > constraints.maxWalkingM || knownBarriers.length > 0
      ? 'Partial match (disclosure)'
      : 'Full step-free match';

  return {
    mode,
    label: labelMap[mode],
    feasible: true,
    total_distance_m: Math.round(totalDistance),
    walking_distance_m: Math.round(walkingDistance),
    estimated_minutes: Math.max(1, Math.round(totalSeconds / 60)),
    transfers,
    accessibility_compatibility: compatibility,
    data_confidence: dataConfidence,
    known_barriers: knownBarriers,
    unknown_disclosures: unknownDisclosures,
    steps,
    geometry,
    node_ids: nodeIds,
  };
}

export function computeRoutes(
  originNodeId: string,
  destinationNodeId: string,
  constraints: AccessibilityConstraints
): RoutePlanResponse {
  const graph = loadGraph();
  const originNode = graph.nodes.get(originNodeId);
  const destNode = graph.nodes.get(destinationNodeId);

  if (!originNode || !destNode) {
    throw new Error('Origin or destination node not found in graph.');
  }

  const routeAccessible = runDijkstra(originNodeId, destinationNodeId, 'most_accessible', constraints, graph);
  const routeLeastWalk = runDijkstra(originNodeId, destinationNodeId, 'least_walking', constraints, graph);
  const routeFastest = runDijkstra(originNodeId, destinationNodeId, 'fastest_feasible', constraints, graph);

  // If most_accessible and least_walking picked identical corridors, check if an alternative step-free corridor exists
  const routes: ComputedRoute[] = [routeAccessible];

  if (routeLeastWalk.node_ids.join(',') !== routeAccessible.node_ids.join(',') || !routeLeastWalk.feasible) {
    routes.push(routeLeastWalk);
  } else if (routeAccessible.feasible && routeAccessible.steps.length > 2) {
    // Try finding a surface/alternate route avoiding the first transit or lift edge to offer real choice
    const transitOrLiftEdge = routeAccessible.steps.find(
      (s) => s.edge_type === 'metro_line' || s.edge_type === 'lift_shaft'
    );
    if (transitOrLiftEdge) {
      const alt = runDijkstra(
        originNodeId,
        destinationNodeId,
        'least_walking',
        constraints,
        graph,
        new Set([transitOrLiftEdge.edge_id])
      );
      if (alt.feasible) {
        alt.label = 'Surface step-free alternative';
        routes.push(alt);
      } else {
        routes.push(routeLeastWalk);
      }
    } else {
      routes.push(routeLeastWalk);
    }
  } else {
    routes.push(routeLeastWalk);
  }

  if (
    routeFastest.node_ids.join(',') !== routeAccessible.node_ids.join(',') &&
    routeFastest.node_ids.join(',') !== routes[1]?.node_ids.join(',')
  ) {
    routes.push(routeFastest);
  } else if (routeFastest.feasible && routeAccessible.steps.length > 2) {
    // Also offer fastest direct surface or transit variant if different
    const firstMetro = routeFastest.steps.find((s) => s.edge_type === 'metro_line');
    if (firstMetro && routes.length < 3) {
      const surfaceAlt = runDijkstra(
        originNodeId,
        destinationNodeId,
        'fastest_feasible',
        constraints,
        graph,
        new Set([firstMetro.edge_id])
      );
      if (surfaceAlt.feasible && !routes.some((r) => r.node_ids.join(',') === surfaceAlt.node_ids.join(','))) {
        surfaceAlt.label = 'No-metro step-free route';
        routes.push(surfaceAlt);
      }
    }
  }

  // Collect active unavailable assets & diagnostics
  const disruptedAssets = db
    .prepare(`
      SELECT a.id as asset_id, a.name as asset_name, a.operational_status as status,
             (SELECT i.id FROM incidents i WHERE i.asset_id = a.id AND i.status != 'resolved' ORDER BY i.updated_at DESC LIMIT 1) as incident_id
      FROM assets a
      WHERE a.operational_status IN ('unavailable', 'degraded')
    `)
    .all() as Array<{ asset_id: string; asset_name: string; status: string; incident_id?: string }>;

  const blockedDiagnostics: string[] = [];
  for (const d of disruptedAssets) {
    if (d.status === 'unavailable') {
      blockedDiagnostics.push(`${d.asset_name} is offline — step-free paths through this asset are excluded.`);
    }
  }

  if (constraints.stepFree || constraints.avoidStairs) {
    blockedDiagnostics.push('Staircase shortcuts excluded by your step-free requirement.');
  }

  return {
    origin: { id: originNode.id, name: originNode.name, lat: originNode.lat, lng: originNode.lng },
    destination: { id: destNode.id, name: destNode.name, lat: destNode.lat, lng: destNode.lng },
    routes,
    blocked_diagnostics: blockedDiagnostics,
    active_disruptions: disruptedAssets,
  };
}

export function getVenueIndoorData(venueId: string) {
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
  if (!venue) return null;

  const floors = db
    .prepare('SELECT * FROM floors WHERE venue_id = ? ORDER BY level_number ASC')
    .all(venueId);
  const nodes = db
    .prepare('SELECT * FROM map_nodes WHERE venue_id = ?')
    .all(venueId) as RawNodeRow[];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = db
    .prepare(`
      SELECT e.*, a.name as asset_name, a.operational_status as asset_status
      FROM map_edges e
      LEFT JOIN assets a ON e.asset_id = a.id
    `)
    .all() as RawEdgeRow[];

  const edges = allEdges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
  const assets = db.prepare('SELECT * FROM assets WHERE venue_id = ?').all(venueId);
  const versions = db
    .prepare('SELECT * FROM map_versions WHERE venue_id = ? ORDER BY version_number DESC')
    .all(venueId);

  return {
    venue,
    floors,
    nodes: nodes.map((n) => ({
      ...n,
      wheelchair_accessible: Boolean(n.wheelchair_accessible),
      step_free: Boolean(n.step_free),
      has_tactile_paving: Boolean(n.has_tactile_paving),
    })),
    edges: edges.map((e) => ({
      ...e,
      bidirectional: Boolean(e.bidirectional),
      has_stairs: Boolean(e.has_stairs),
      step_free: Boolean(e.step_free),
      wheelchair_accessible: Boolean(e.wheelchair_accessible),
      operational_status: e.asset_status || e.operational_status,
    })),
    assets,
    versions,
  };
}
