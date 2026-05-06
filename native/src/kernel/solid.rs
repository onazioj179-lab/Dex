// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Solid — Rust FFI wrapper for the C solid geometry kernel
// Exposes N-API functions so TypeScript can call the C mesh operations.
// ═══════════════════════════════════════════════════════════════════════════

use napi_derive::napi;
use std::ptr;

// ---------------------------------------------------------------------------
// C FFI declarations (matches axl_solid.h)
// ---------------------------------------------------------------------------

#[repr(C)]
struct CAxlVec3 {
    x: f32,
    y: f32,
    z: f32,
}

#[repr(C)]
struct CAxlPoint2D {
    x: f32,
    y: f32,
}

#[repr(C)]
struct CAxlMesh {
    vertices: *mut f32,
    vertex_count: u32,
    normals: *mut f32,
    indices: *mut u32,
    index_count: u32,
    edges: *mut u32,
    edge_count: u32,
}

extern "C" {
    fn axl_mesh_free(mesh: *mut CAxlMesh);
    fn axl_prim_box(w: f32, h: f32, d: f32) -> *mut CAxlMesh;
    fn axl_prim_cylinder(radius: f32, height: f32, segments: u32) -> *mut CAxlMesh;
    fn axl_prim_sphere(radius: f32, rings: u32, segments: u32) -> *mut CAxlMesh;
    fn axl_prim_cone(radius: f32, height: f32, segments: u32) -> *mut CAxlMesh;
    fn axl_prim_torus(major_r: f32, minor_r: f32, major_seg: u32, minor_seg: u32) -> *mut CAxlMesh;
    fn axl_extrude(
        profile: *const CAxlPoint2D,
        npts: u32,
        dir: CAxlVec3,
        distance: f32,
    ) -> *mut CAxlMesh;
    fn axl_revolve(
        profile: *const CAxlPoint2D,
        npts: u32,
        angle_deg: f32,
        segments: u32,
    ) -> *mut CAxlMesh;
    fn axl_boolean(a: *const CAxlMesh, b: *const CAxlMesh, op: i32) -> *mut CAxlMesh;
    fn axl_volume(mesh: *const CAxlMesh) -> f32;
    fn axl_surface_area(mesh: *const CAxlMesh) -> f32;
    fn axl_is_manifold(mesh: *const CAxlMesh) -> i32;
}

// ---------------------------------------------------------------------------
// NAPI-visible result type
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct AxlMeshResult {
    /// Flat f32 array: [x0,y0,z0, x1,y1,z1, ...]
    pub vertices: Vec<f64>,
    /// Flat f32 array of per-vertex normals
    pub normals: Vec<f64>,
    /// Triangle indices (groups of 3)
    pub indices: Vec<u32>,
    /// Edge indices for wireframe (groups of 2)
    pub edges: Vec<u32>,
    pub vertex_count: u32,
    pub triangle_count: u32,
    pub edge_count: u32,
}

#[napi(object)]
pub struct AxlMeshStats {
    pub volume: f64,
    pub surface_area: f64,
    pub is_manifold: bool,
    pub vertex_count: u32,
    pub triangle_count: u32,
    pub edge_count: u32,
}

// ---------------------------------------------------------------------------
// Internal helper: C mesh → NAPI result (with RAII guard for leak safety)
// ---------------------------------------------------------------------------

/// RAII guard that ensures axl_mesh_free is called even on panic
struct MeshGuard(*mut CAxlMesh);
impl Drop for MeshGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { axl_mesh_free(self.0); }
        }
    }
}

fn c_mesh_to_result_safe(mesh: *mut CAxlMesh) -> AxlMeshResult {
    if mesh.is_null() {
        return AxlMeshResult {
            vertices: vec![],
            normals: vec![],
            indices: vec![],
            edges: vec![],
            vertex_count: 0,
            triangle_count: 0,
            edge_count: 0,
        };
    }

    let guard = MeshGuard(mesh);

    let m = unsafe { &*guard.0 };
    let vc = m.vertex_count as usize;
    let ic = m.index_count as usize;
    let ec = m.edge_count as usize;

    let vertices: Vec<f64> = if !m.vertices.is_null() && vc > 0 {
        unsafe { std::slice::from_raw_parts(m.vertices, vc * 3) }
            .iter()
            .map(|&v| v as f64)
            .collect()
    } else {
        vec![]
    };

    let normals: Vec<f64> = if !m.normals.is_null() && vc > 0 {
        unsafe { std::slice::from_raw_parts(m.normals, vc * 3) }
            .iter()
            .map(|&v| v as f64)
            .collect()
    } else {
        vec![]
    };

    let indices: Vec<u32> = if !m.indices.is_null() && ic > 0 {
        unsafe { std::slice::from_raw_parts(m.indices, ic) }.to_vec()
    } else {
        vec![]
    };

    let edges: Vec<u32> = if !m.edges.is_null() && ec > 0 {
        unsafe { std::slice::from_raw_parts(m.edges, ec * 2) }.to_vec()
    } else {
        vec![]
    };

    // guard drops here, calling axl_mesh_free automatically

    AxlMeshResult {
        vertices,
        normals,
        indices,
        edges,
        vertex_count: vc as u32,
        triangle_count: (ic / 3) as u32,
        edge_count: ec as u32,
    }
}

// ---------------------------------------------------------------------------
// NAPI Exports — Primitives
// ---------------------------------------------------------------------------

#[napi]
pub fn axl_create_box(width: f64, height: f64, depth: f64) -> AxlMeshResult {
    c_mesh_to_result_safe(unsafe { axl_prim_box(width as f32, height as f32, depth as f32) })
}

#[napi]
pub fn axl_create_cylinder(radius: f64, height: f64, segments: Option<u32>) -> AxlMeshResult {
    let seg = segments.unwrap_or(24).max(3);
    c_mesh_to_result_safe(unsafe { axl_prim_cylinder(radius as f32, height as f32, seg) })
}

#[napi]
pub fn axl_create_sphere(radius: f64, rings: Option<u32>, segments: Option<u32>) -> AxlMeshResult {
    let r = rings.unwrap_or(16).max(2);
    let s = segments.unwrap_or(24).max(3);
    c_mesh_to_result_safe(unsafe { axl_prim_sphere(radius as f32, r, s) })
}

#[napi]
pub fn axl_create_cone(radius: f64, height: f64, segments: Option<u32>) -> AxlMeshResult {
    let seg = segments.unwrap_or(24).max(3);
    c_mesh_to_result_safe(unsafe { axl_prim_cone(radius as f32, height as f32, seg) })
}

#[napi]
pub fn axl_create_torus(
    major_radius: f64,
    minor_radius: f64,
    major_segments: Option<u32>,
    minor_segments: Option<u32>,
) -> AxlMeshResult {
    let maj = major_segments.unwrap_or(32).max(3);
    let min = minor_segments.unwrap_or(16).max(3);
    c_mesh_to_result_safe(unsafe {
        axl_prim_torus(
            major_radius as f32,
            minor_radius as f32,
            maj,
            min,
        )
    })
}

// ---------------------------------------------------------------------------
// NAPI Exports — Extrude & Revolve
// ---------------------------------------------------------------------------

/// profile_points: flat array [x0,y0, x1,y1, ...]
/// dir: [dx,dy,dz]
#[napi]
pub fn axl_extrude_profile(
    profile_points: Vec<f64>,
    dir: Vec<f64>,
    distance: f64,
) -> AxlMeshResult {
    let npts = (profile_points.len() / 2) as u32;
    if npts < 3 || dir.len() < 3 {
        return AxlMeshResult {
            vertices: vec![],
            normals: vec![],
            indices: vec![],
            edges: vec![],
            vertex_count: 0,
            triangle_count: 0,
            edge_count: 0,
        };
    }

    let pts: Vec<CAxlPoint2D> = (0..npts as usize)
        .map(|i| CAxlPoint2D {
            x: profile_points[i * 2] as f32,
            y: profile_points[i * 2 + 1] as f32,
        })
        .collect();

    let d = CAxlVec3 {
        x: dir[0] as f32,
        y: dir[1] as f32,
        z: dir[2] as f32,
    };

    c_mesh_to_result_safe(unsafe { axl_extrude(pts.as_ptr(), npts, d, distance as f32) })
}

/// profile_points: flat array [x0,y0, x1,y1, ...]
#[napi]
pub fn axl_revolve_profile(
    profile_points: Vec<f64>,
    angle_deg: f64,
    segments: Option<u32>,
) -> AxlMeshResult {
    let npts = (profile_points.len() / 2) as u32;
    let seg = segments.unwrap_or(32);
    if npts < 2 {
        return AxlMeshResult {
            vertices: vec![],
            normals: vec![],
            indices: vec![],
            edges: vec![],
            vertex_count: 0,
            triangle_count: 0,
            edge_count: 0,
        };
    }

    let pts: Vec<CAxlPoint2D> = (0..npts as usize)
        .map(|i| CAxlPoint2D {
            x: profile_points[i * 2] as f32,
            y: profile_points[i * 2 + 1] as f32,
        })
        .collect();

    c_mesh_to_result_safe(unsafe { axl_revolve(pts.as_ptr(), npts, angle_deg as f32, seg) })
}

// ---------------------------------------------------------------------------
// NAPI Exports — CSG Boolean
// ---------------------------------------------------------------------------

/// Perform a CSG boolean: op = "union" | "subtract" | "intersect"
/// Each mesh is provided as flat arrays (vertices, indices).
#[napi]
pub fn axl_boolean_op(
    a_vertices: Vec<f64>,
    a_indices: Vec<u32>,
    b_vertices: Vec<f64>,
    b_indices: Vec<u32>,
    op: String,
) -> AxlMeshResult {
    let op_code: i32 = match op.as_str() {
        "union" => 0,
        "subtract" => 1,
        "intersect" => 2,
        _ => 0,
    };

    let a_vc = (a_vertices.len() / 3) as u32;
    let b_vc = (b_vertices.len() / 3) as u32;

    // Convert f64 → f32 for C
    let a_verts_f32: Vec<f32> = a_vertices.iter().map(|&v| v as f32).collect();
    let b_verts_f32: Vec<f32> = b_vertices.iter().map(|&v| v as f32).collect();

    // Build zero normals (C boolean doesn't need them as input)
    let a_normals: Vec<f32> = vec![0.0f32; a_verts_f32.len()];
    let b_normals: Vec<f32> = vec![0.0f32; b_verts_f32.len()];

    unsafe {
        // Construct temporary C mesh structs on the stack
        let mesh_a = CAxlMesh {
            vertices: a_verts_f32.as_ptr() as *mut f32,
            vertex_count: a_vc,
            normals: a_normals.as_ptr() as *mut f32,
            indices: a_indices.as_ptr() as *mut u32,
            index_count: a_indices.len() as u32,
            edges: ptr::null_mut(),
            edge_count: 0,
        };
        let mesh_b = CAxlMesh {
            vertices: b_verts_f32.as_ptr() as *mut f32,
            vertex_count: b_vc,
            normals: b_normals.as_ptr() as *mut f32,
            indices: b_indices.as_ptr() as *mut u32,
            index_count: b_indices.len() as u32,
            edges: ptr::null_mut(),
            edge_count: 0,
        };

        let result = axl_boolean(&mesh_a as *const CAxlMesh, &mesh_b as *const CAxlMesh, op_code);
        c_mesh_to_result_safe(result)
    }
}

// ---------------------------------------------------------------------------
// NAPI Exports — Queries
// ---------------------------------------------------------------------------

/// Get mesh statistics: volume, surface area, manifold check.
/// vertices: flat [x0,y0,z0, ...], indices: triangle list
#[napi]
pub fn axl_mesh_stats(vertices: Vec<f64>, indices: Vec<u32>) -> AxlMeshStats {
    let vc = (vertices.len() / 3) as u32;
    let verts_f32: Vec<f32> = vertices.iter().map(|&v| v as f32).collect();
    let normals: Vec<f32> = vec![0.0f32; verts_f32.len()];

    unsafe {
        let mesh = CAxlMesh {
            vertices: verts_f32.as_ptr() as *mut f32,
            vertex_count: vc,
            normals: normals.as_ptr() as *mut f32,
            indices: indices.as_ptr() as *mut u32,
            index_count: indices.len() as u32,
            edges: ptr::null_mut(),
            edge_count: 0,
        };

        AxlMeshStats {
            volume: axl_volume(&mesh as *const CAxlMesh) as f64,
            surface_area: axl_surface_area(&mesh as *const CAxlMesh) as f64,
            is_manifold: axl_is_manifold(&mesh as *const CAxlMesh) != 0,
            vertex_count: vc,
            triangle_count: indices.len() as u32 / 3,
            edge_count: 0,
        }
    }
}
