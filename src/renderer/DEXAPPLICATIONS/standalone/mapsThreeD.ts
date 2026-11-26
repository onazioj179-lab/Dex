// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Maps 3D: real elevation, not a tilted flat map. Terrain comes from the
// public, key-less AWS Terrarium elevation tiles (raster-dem); hill shading is
// drawn from the same data; buildings are extruded to their mapped heights
// (OpenFreeMap / OpenMapTiles `render_height`); a sky fills the horizon.
// Every style switch replaces the style, so `applyThreeD` runs again on
// 'style.load'.

import type * as maplibregl from 'maplibre-gl';

export const DEM_SOURCE = 'dex-dem';
const HILLSHADE = 'dex-hillshade';
const BUILDINGS = 'dex-buildings-3d';
const OMT = 'dex-openmaptiles';
export const TERRARIUM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';
export const TERRAIN_EXAGGERATION = 1.4;

/** The first symbol (label) layer: 3D layers go under the labels. */
function firstSymbolLayer(map: maplibregl.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

/** Turn real 3D on or off for the current style. Safe to call repeatedly. */
export function applyThreeD(map: maplibregl.Map, on: boolean, dark: boolean): void {
  if (!map.isStyleLoaded()) return;
  const style = map.getStyle();
  const hasOwnBuildings = !!style?.layers?.some((l) => l.type === 'fill-extrusion' && l.id !== BUILDINGS);

  if (!on) {
    map.setTerrain(null);
    if (map.getLayer(HILLSHADE)) map.removeLayer(HILLSHADE);
    if (map.getLayer(BUILDINGS)) map.removeLayer(BUILDINGS);
    return;
  }

  if (!map.getSource(DEM_SOURCE)) {
    map.addSource(DEM_SOURCE, {
      type: 'raster-dem', tiles: [TERRARIUM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      attribution: 'Elevation: Mapzen Terrain Tiles (AWS Open Data)',
    });
  }
  map.setTerrain({ source: DEM_SOURCE, exaggeration: TERRAIN_EXAGGERATION });

  const beforeLabels = firstSymbolLayer(map);
  if (!map.getLayer(HILLSHADE)) {
    map.addLayer({
      id: HILLSHADE, type: 'hillshade', source: DEM_SOURCE,
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': dark ? '#000000' : '#473B24',
        'hillshade-highlight-color': dark ? '#3a3a3c' : '#FFFFFF',
      },
    }, beforeLabels);
  }

  // Raster styles (satellite, topo) have no building data: add OpenMapTiles
  // buildings extruded to their real heights.
  if (!hasOwnBuildings && !map.getLayer(BUILDINGS)) {
    if (!map.getSource(OMT)) map.addSource(OMT, { type: 'vector', url: OPENFREEMAP });
    map.addLayer({
      id: BUILDINGS, type: 'fill-extrusion', source: OMT, 'source-layer': 'building', minzoom: 14,
      paint: {
        // Light massing reads over imagery in either theme (dark blocks looked like holes).
        'fill-extrusion-color': '#e5e5ea',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    }, beforeLabels);
  }

  try {
    map.setSky({
      'sky-color': dark ? '#0b1a33' : '#88b4e6',
      'horizon-color': dark ? '#1c2a44' : '#dbe9f7',
      'fog-color': dark ? '#0b1220' : '#f2f5f9',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.4,
    });
  } catch { /* older engines: no sky, the rest still works */ }
}
