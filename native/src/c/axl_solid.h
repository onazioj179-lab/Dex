// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/* ===========================================================================
 * DEX Platform -- Copyright (c) 2026 DEX. All rights reserved.
 * ===========================================================================
 * AXL Solid Geometry Kernel (C)
 *
 * Real mesh-based solid geometry operations: extrude, revolve, CSG booleans,
 * primitives, volume/area computation.  Written in C for maximum performance
 * — the same language Blender's mesh kernel uses.
 *
 * Compiled via Rust's cc crate, called through FFI from the NAPI bridge.
 * =========================================================================== */

#ifndef AXL_SOLID_H
#define AXL_SOLID_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---------------------------------------------------------------------------
 * Core mesh structure
 * --------------------------------------------------------------------------- */

typedef struct {
    float x, y, z;
} axl_vec3_t;

typedef struct {
    /* Vertex positions (3 floats per vertex) */
    float    *vertices;
    uint32_t  vertex_count;

    /* Per-vertex normals (3 floats per normal) */
    float    *normals;

    /* Triangle indices (3 per triangle) */
    uint32_t *indices;
    uint32_t  index_count;

    /* Edge indices for wireframe (2 per edge) */
    uint32_t *edges;
    uint32_t  edge_count;
} axl_mesh_t;

typedef struct {
    float x, y;
} axl_point2d_t;

typedef enum {
    AXL_BOOL_UNION     = 0,
    AXL_BOOL_SUBTRACT  = 1,
    AXL_BOOL_INTERSECT = 2,
} axl_bool_op_t;

/* ---------------------------------------------------------------------------
 * Lifecycle
 * --------------------------------------------------------------------------- */

/** Allocate and zero-initialize a mesh. Caller must free with axl_mesh_free(). */
axl_mesh_t *axl_mesh_alloc(void);

/** Free all memory associated with a mesh. */
void axl_mesh_free(axl_mesh_t *mesh);

/* ---------------------------------------------------------------------------
 * Primitive generation
 * --------------------------------------------------------------------------- */

/** Generate a box mesh centered at origin. */
axl_mesh_t *axl_prim_box(float width, float height, float depth);

/** Generate a cylinder mesh along Y axis. */
axl_mesh_t *axl_prim_cylinder(float radius, float height, uint32_t segments);

/** Generate a sphere mesh. */
axl_mesh_t *axl_prim_sphere(float radius, uint32_t rings, uint32_t segments);

/** Generate a cone mesh along Y axis. */
axl_mesh_t *axl_prim_cone(float radius, float height, uint32_t segments);

/** Generate a torus mesh. */
axl_mesh_t *axl_prim_torus(float major_r, float minor_r,
                            uint32_t major_seg, uint32_t minor_seg);

/* ---------------------------------------------------------------------------
 * Extrude & Revolve
 * --------------------------------------------------------------------------- */

/**
 * Extrude a 2D closed profile along a direction vector.
 * profile: array of 2D points (x,y)
 * npts: number of points in profile
 * dir: extrusion direction (unit vector)
 * distance: extrusion length
 */
axl_mesh_t *axl_extrude(const axl_point2d_t *profile, uint32_t npts,
                         axl_vec3_t dir, float distance);

/**
 * Revolve a 2D profile around the Y axis.
 * angle_deg: sweep angle in degrees (360 = full revolution)
 * segments: number of angular divisions
 */
axl_mesh_t *axl_revolve(const axl_point2d_t *profile, uint32_t npts,
                         float angle_deg, uint32_t segments);

/* ---------------------------------------------------------------------------
 * CSG Boolean Operations
 * --------------------------------------------------------------------------- */

/**
 * Perform a CSG boolean operation: union, subtract, or intersect.
 * Returns new mesh; inputs are not modified.
 */
axl_mesh_t *axl_boolean(const axl_mesh_t *a, const axl_mesh_t *b,
                         axl_bool_op_t op);

/* ---------------------------------------------------------------------------
 * Queries
 * --------------------------------------------------------------------------- */

/** Compute mesh volume using signed tetrahedra method. */
float axl_volume(const axl_mesh_t *mesh);

/** Compute total surface area. */
float axl_surface_area(const axl_mesh_t *mesh);

/** Compute axis-aligned bounding box. */
void axl_bbox(const axl_mesh_t *mesh,
              axl_vec3_t *out_min, axl_vec3_t *out_max);

/** Count unique edges. */
uint32_t axl_edge_count(const axl_mesh_t *mesh);

/** Return 1 if mesh is manifold (each edge has exactly 2 faces). */
int axl_is_manifold(const axl_mesh_t *mesh);

#ifdef __cplusplus
}
#endif

#endif /* AXL_SOLID_H */
