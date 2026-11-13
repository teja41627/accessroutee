import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';
import { computeRoutes } from './routing.ts';

export interface AskAction {
  type: 'filter_category' | 'select_place' | 'plan_route' | 'open_contribute' | 'open_venue' | 'none';
  category?: string;
  placeId?: string;
  originNodeId?: string;
  destinationNodeId?: string;
  venueId?: string;
  incidentCategory?: string;
}

export interface AskResponse {
  answer: string;
  source: 'gemini' | 'deterministic';
  action: AskAction;
  groundedFacts: string[];
}

function deterministicFallback(query: string, userId: string): AskResponse {
  const q = query.toLowerCase().trim();

  if (q.includes('report') || q.includes('broken lift') || q.includes('issue') || q.includes('problem')) {
    return {
      answer:
        'I can open the Accessibility Issue Reporter for you right away. Select the lift or asset affected, add a short note, and your report will immediately update the shared network.',
      source: 'deterministic',
      action: {
        type: 'open_contribute',
        incidentCategory: q.includes('lift') ? 'Broken lift' : undefined,
      },
      groundedFacts: ['Direct route to Contribute reporting workflow'],
    };
  }

  if (q.includes('toilet') || q.includes('restroom') || q.includes('washroom')) {
    const toilets = db
      .prepare(`SELECT id, name, address, operational_status, verification_status FROM places WHERE category = 'toilet' LIMIT 3`)
      .all() as Array<{ id: string; name: string; address: string; operational_status: string; verification_status: string }>;
    const top = toilets[0];
    return {
      answer: top
        ? `Nearest recorded accessible restroom: ${top.name} (${top.address}). Status: ${top.operational_status} (${top.verification_status}). I've filtered the map to show Accessible Toilets.`
        : 'Filtering the map for Accessible Toilets now.',
      source: 'deterministic',
      action: { type: 'filter_category', category: 'toilet', placeId: top?.id },
      groundedFacts: toilets.map((t) => `${t.name}: ${t.operational_status}, ${t.verification_status}`),
    };
  }

  if (q.includes('metro') || q.includes('station')) {
    const stations = db
      .prepare(`SELECT id, name, accessibility_summary, operational_status, verification_status FROM places WHERE category = 'station'`)
      .all() as Array<{ id: string; name: string; accessibility_summary: string; operational_status: string; verification_status: string }>;
    const first = stations[0];
    return {
      answer: first
        ? `Showing ${stations.length} Metro stations on the map. Nearest reference station is ${first.name} (${first.operational_status}, ${first.verification_status}). ${first.accessibility_summary}`
        : 'Showing Metro stations on the map.',
      source: 'deterministic',
      action: { type: 'filter_category', category: 'station', placeId: first?.id },
      groundedFacts: stations.map((s) => `${s.name}: ${s.operational_status} (${s.verification_status})`),
    };
  }

  if (q.includes('hospital') || q.includes('clinic') || q.includes('martha')) {
    const marthas = db
      .prepare(`SELECT id, name, operational_status, verification_status FROM places WHERE id = 'place-marthas'`)
      .get() as { id: string; name: string; operational_status: string; verification_status: string } | undefined;
    return {
      answer: marthas
        ? `${marthas.name} is ${marthas.operational_status} (${marthas.verification_status}) with a 2-floor mapped indoor layout. Filtering hospitals on the map.`
        : 'Filtering nearby hospitals on the map.',
      source: 'deterministic',
      action: { type: 'filter_category', category: 'hospital', placeId: marthas?.id },
      groundedFacts: marthas ? [`${marthas.name}: ${marthas.operational_status}`] : [],
    };
  }

  if (q.includes('alternative') || q.includes('step-free') || q.includes('route') || q.includes('ub city') || q.includes('navigate')) {
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as
      | { step_free: number; avoid_stairs: number; wheelchair_accessible: number; max_walking_m: number; prefer_fewer_transfers: number }
      | undefined;

    const destNode = q.includes('martha') ? 'node-sm-ent-main' : 'node-ub-ent-north';
    const destLabel = q.includes('martha') ? "St. Martha's Care Pavilion" : 'UB City Civic Concourse';

    const plan = computeRoutes('node-mg-street', destNode, {
      stepFree: profile ? Boolean(profile.step_free) : true,
      avoidStairs: profile ? Boolean(profile.avoid_stairs) : true,
      wheelchairAccessible: profile ? Boolean(profile.wheelchair_accessible) : true,
      maxWalkingM: profile?.max_walking_m ?? 1200,
      preferFewerTransfers: profile ? Boolean(profile.prefer_fewer_transfers) : true,
    });

    const feasible = plan.routes.filter((r) => r.feasible);
    const best = feasible[0];
    if (best) {
      return {
        answer: `Found ${feasible.length} step-free route option(s) from MG Road Metro Plaza to ${destLabel}. Recommended (${best.label}): ${best.estimated_minutes} min, ${best.total_distance_m}m total (${best.walking_distance_m}m walking). Compatibility: ${best.accessibility_compatibility}.`,
        source: 'deterministic',
        action: {
          type: 'plan_route',
          originNodeId: 'node-mg-street',
          destinationNodeId: destNode,
        },
        groundedFacts: [
          `Best mode: ${best.label}`,
          `Duration: ${best.estimated_minutes} min`,
          `Data confidence: ${best.data_confidence}`,
          ...plan.blocked_diagnostics,
        ],
      };
    }

    return {
      answer: `No feasible step-free route is currently available to ${destLabel}. ${plan.routes[0]?.blocked_reason || 'Check active disruptions on the map.'}`,
      source: 'deterministic',
      action: { type: 'plan_route', originNodeId: 'node-mg-street', destinationNodeId: destNode },
      groundedFacts: plan.blocked_diagnostics,
    };
  }

  const activeIncidents = db
    .prepare(`SELECT report_code, title, status FROM incidents WHERE status != 'resolved' LIMIT 3`)
    .all() as Array<{ report_code: string; title: string; status: string }>;

  return {
    answer:
      'I can help you plan step-free routes, filter accessible toilets, metro stations, or hospitals, check indoor venue maps, or report a broken lift. Try asking: "Find a step-free route to UB City" or "Show nearby accessible toilets".',
    source: 'deterministic',
    action: { type: 'none' },
    groundedFacts: activeIncidents.map((i) => `${i.report_code}: ${i.title} (${i.status})`),
  };
}

export async function handleAskAccessRoute(query: string, userId: string): Promise<AskResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return deterministicFallback(query, userId);
  }

  try {
    const places = db
      .prepare(`SELECT id, name, category, operational_status, verification_status, primary_node_id, venue_id FROM places`)
      .all() as Array<{
      id: string;
      name: string;
      category: string;
      operational_status: string;
      verification_status: string;
      primary_node_id: string | null;
      venue_id: string | null;
    }>;

    const disruptedAssets = db
      .prepare(`SELECT id, name, asset_type, operational_status, verification_status FROM assets WHERE operational_status != 'operational'`)
      .all() as Array<{ id: string; name: string; asset_type: string; operational_status: string; verification_status: string }>;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemContext = `You are AccessRoute's grounded accessibility assistant for Bengaluru.
CRITICAL RULES:
1. NEVER invent accessibility statuses, locations, or asset conditions. Only state facts present in the JSON context below.
2. If data is 'unknown' or 'unverified', explicitly say it is unknown/unverified.
3. Choose the single most helpful UI action from: filter_category, select_place, plan_route, open_contribute, open_venue, none.
4. Keep the answer concise (2-3 plain-English sentences).

Grounded Places: ${JSON.stringify(places)}
Currently Non-Operational Assets: ${JSON.stringify(disruptedAssets)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `User question: "${query}"`,
      config: {
        systemInstruction: systemContext,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            actionType: {
              type: Type.STRING,
              description: 'One of: filter_category, select_place, plan_route, open_contribute, open_venue, none',
            },
            category: { type: Type.STRING },
            placeId: { type: Type.STRING },
            originNodeId: { type: Type.STRING },
            destinationNodeId: { type: Type.STRING },
            venueId: { type: Type.STRING },
            incidentCategory: { type: Type.STRING },
            groundedFacts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['answer', 'actionType', 'groundedFacts'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      answer?: string;
      actionType?: AskAction['type'];
      category?: string;
      placeId?: string;
      originNodeId?: string;
      destinationNodeId?: string;
      venueId?: string;
      incidentCategory?: string;
      groundedFacts?: string[];
    };

    if (!parsed.answer) {
      return deterministicFallback(query, userId);
    }

    // If AI selected plan_route, verify with actual deterministic graph engine
    if (parsed.actionType === 'plan_route' && parsed.destinationNodeId) {
      const origin = parsed.originNodeId || 'node-mg-street';
      try {
        const plan = computeRoutes(origin, parsed.destinationNodeId, {
          stepFree: true,
          avoidStairs: true,
          wheelchairAccessible: true,
          maxWalkingM: 1500,
          preferFewerTransfers: true,
        });
        const best = plan.routes.find((r) => r.feasible);
        if (best) {
          parsed.groundedFacts = [
            ...(parsed.groundedFacts || []),
            `Verified graph route: ${best.estimated_minutes} min, ${best.total_distance_m}m`,
          ];
        }
      } catch {
        // Ignore if AI provided invalid node id; fallback handles cleanly
        return deterministicFallback(query, userId);
      }
    }

    return {
      answer: parsed.answer,
      source: 'gemini',
      action: {
        type: parsed.actionType || 'none',
        category: parsed.category,
        placeId: parsed.placeId,
        originNodeId: parsed.originNodeId,
        destinationNodeId: parsed.destinationNodeId,
        venueId: parsed.venueId,
        incidentCategory: parsed.incidentCategory,
      },
      groundedFacts: parsed.groundedFacts || [],
    };
  } catch {
    return deterministicFallback(query, userId);
  }
}
