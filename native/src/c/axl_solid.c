// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/* ===========================================================================
 * DEX Platform -- Copyright (c) 2026 DEX. All rights reserved.
 * ===========================================================================
 * AXL Solid Geometry Kernel — Implementation
 *
 * Pure C mesh kernel.  No dependencies beyond libc/libm.
 * Mirrors the approach Blender uses for its mesh geometry core.
 * =========================================================================== */

#include "axl_solid.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ========================================================================= */
/* Internal helpers                                                          */
/* ========================================================================= */

static axl_vec3_t v3(float x, float y, float z) {
    axl_vec3_t v = { x, y, z };
    return v;
}

static axl_vec3_t v3_sub(axl_vec3_t a, axl_vec3_t b) {
    return v3(a.x - b.x, a.y - b.y, a.z - b.z);
}

static axl_vec3_t v3_add(axl_vec3_t a, axl_vec3_t b) {
    return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}

static axl_vec3_t v3_scale(axl_vec3_t a, float s) {
    return v3(a.x * s, a.y * s, a.z * s);
}

static axl_vec3_t v3_cross(axl_vec3_t a, axl_vec3_t b) {
    return v3(a.y * b.z - a.z * b.y,
              a.z * b.x - a.x * b.z,
              a.x * b.y - a.y * b.x);
}

static float v3_dot(axl_vec3_t a, axl_vec3_t b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

static float v3_len(axl_vec3_t v) {
    return sqrtf(v.x * v.x + v.y * v.y + v.z * v.z);
}

static axl_vec3_t v3_normalize(axl_vec3_t v) {
    float len = v3_len(v);
    if (len < 1e-10f) return v3(0, 0, 0);
    return v3_scale(v, 1.0f / len);
}

/* Grow a mesh's vertex buffer by n vertices. Returns index of first new vert. */
static uint32_t mesh_reserve_verts(axl_mesh_t *m, uint32_t n) {
    uint32_t base = m->vertex_count;
    /* Overflow check */
    if (n > 0x7FFFFF || base > 0x7FFFFF - n) return base;
    uint32_t new_count = base + n;
    float *new_v = (float *)realloc(m->vertices, new_count * 3 * sizeof(float));
    float *new_n = (float *)realloc(m->normals,  new_count * 3 * sizeof(float));
    if (!new_v || !new_n) {
        /* Partial or full allocation failure — restore consistent state.
         * If one realloc succeeded but the other failed, shrink the
         * successful one back to the original size (a shrink-realloc
         * must not fail) so vertices and normals stay in sync. */
        if (new_v && !new_n) {
            float *shrunk = (float *)realloc(new_v, base * 3 * sizeof(float));
            m->vertices = shrunk ? shrunk : new_v;
        } else if (new_n && !new_v) {
            float *shrunk = (float *)realloc(new_n, base * 3 * sizeof(float));
            m->normals = shrunk ? shrunk : new_n;
        }
        return base;
    }
    m->vertices = new_v;
    m->normals = new_n;
    m->vertex_count = new_count;
    return base;
}

/* Grow a mesh's index buffer by n indices. Returns index of first new idx. */
static uint32_t mesh_reserve_indices(axl_mesh_t *m, uint32_t n) {
    uint32_t base = m->index_count;
    /* Overflow check */
    if (n > 0xFFFFFF || base > 0xFFFFFF - n) return base;
    uint32_t new_count = base + n;
    uint32_t *new_i = (uint32_t *)realloc(m->indices, new_count * sizeof(uint32_t));
    if (!new_i) return base;
    m->indices = new_i;
    m->index_count = new_count;
    return base;
}

static void mesh_set_vert(axl_mesh_t *m, uint32_t i, axl_vec3_t pos, axl_vec3_t norm) {
    m->vertices[i * 3 + 0] = pos.x;
    m->vertices[i * 3 + 1] = pos.y;
    m->vertices[i * 3 + 2] = pos.z;
    m->normals[i * 3 + 0]  = norm.x;
    m->normals[i * 3 + 1]  = norm.y;
    m->normals[i * 3 + 2]  = norm.z;
}

/* Build wireframe edge list from triangle indices (deduplicated). */
static void mesh_build_edges(axl_mesh_t *m) {
    if (!m || m->index_count == 0) {
        if (m) { m->edges = NULL; m->edge_count = 0; }
        return;
    }

    /* Upper bound: 3 edges per triangle */
    uint32_t max_edges = m->index_count; /* index_count/3 triangles * 3 edges */
    uint32_t *temp = (uint32_t *)malloc(max_edges * 2 * sizeof(uint32_t));
    if (!temp) { m->edges = NULL; m->edge_count = 0; return; }
    uint32_t count = 0;

    /* Simple dedup using a hash set (open addressing).
     * For meshes up to ~100k tris this is fast enough. */
    uint32_t cap = max_edges * 2;
    if (cap < 64) cap = 64;
    /* Round up to power of 2 */
    uint32_t p = 1;
    while (p < cap) p <<= 1;
    cap = p;

    uint64_t *seen = (uint64_t *)calloc(cap, sizeof(uint64_t));
    if (!seen) { free(temp); m->edges = NULL; m->edge_count = 0; return; }
    uint32_t mask = cap - 1;

    for (uint32_t i = 0; i + 2 < m->index_count; i += 3) {
        uint32_t tri[3] = { m->indices[i], m->indices[i+1], m->indices[i+2] };
        for (int e = 0; e < 3; e++) {
            uint32_t a = tri[e], b = tri[(e + 1) % 3];
            if (a > b) { uint32_t t = a; a = b; b = t; }
            uint64_t key = ((uint64_t)a << 32) | (uint64_t)b;
            uint64_t stored = key | 1; /* distinguish from empty (0) */
            uint32_t slot = (uint32_t)((key * 2654435761ULL) >> 16) & mask;
            int found = 0;
            for (uint32_t probe = 0; probe < cap; probe++) {
                uint32_t idx = (slot + probe) & mask;
                if (seen[idx] == 0) {
                    seen[idx] = stored;
                    break;
                }
                if (seen[idx] == stored) {
                    found = 1;
                    break;
                }
            }
            if (!found) {
                /* Bounds check: prevent buffer overflow */
                if (count < max_edges) {
                    temp[count * 2 + 0] = a;
                    temp[count * 2 + 1] = b;
                    count++;
                }
            }
        }
    }

    free(seen);
    m->edges = (uint32_t *)realloc(temp, count * 2 * sizeof(uint32_t));
    if (!m->edges) { m->edges = temp; } /* realloc failure: keep original */
    m->edge_count = count;
}

/* ========================================================================= */
/* Lifecycle                                                                 */
/* ========================================================================= */

axl_mesh_t *axl_mesh_alloc(void) {
    axl_mesh_t *m = (axl_mesh_t *)calloc(1, sizeof(axl_mesh_t));
    return m;
}

void axl_mesh_free(axl_mesh_t *mesh) {
    if (!mesh) return;
    free(mesh->vertices);
    free(mesh->normals);
    free(mesh->indices);
    free(mesh->edges);
    free(mesh);
}

/* ========================================================================= */
/* Primitives                                                                */
/* ========================================================================= */

axl_mesh_t *axl_prim_box(float w, float h, float d) {
    axl_mesh_t *m = axl_mesh_alloc();
    float hw = w * 0.5f, hh = h * 0.5f, hd = d * 0.5f;

    /* 6 faces × 4 verts = 24 verts, 6 faces × 2 tris × 3 = 36 indices */
    mesh_reserve_verts(m, 24);
    mesh_reserve_indices(m, 36);

    typedef struct { int corners[4]; axl_vec3_t n; } face_t;
    axl_vec3_t corners[8] = {
        {-hw,-hh,-hd}, { hw,-hh,-hd}, { hw, hh,-hd}, {-hw, hh,-hd},
        {-hw,-hh, hd}, { hw,-hh, hd}, { hw, hh, hd}, {-hw, hh, hd},
    };
    face_t faces[6] = {
        {{0,1,2,3}, {0,0,-1}},  /* front  */
        {{5,4,7,6}, {0,0, 1}},  /* back   */
        {{4,0,3,7}, {-1,0,0}},  /* left   */
        {{1,5,6,2}, { 1,0,0}},  /* right  */
        {{3,2,6,7}, {0, 1,0}},  /* top    */
        {{4,5,1,0}, {0,-1,0}},  /* bottom */
    };

    for (int f = 0; f < 6; f++) {
        uint32_t base = f * 4;
        for (int v = 0; v < 4; v++) {
            mesh_set_vert(m, base + v, corners[faces[f].corners[v]], faces[f].n);
        }
        uint32_t ib = f * 6;
        m->indices[ib+0] = base;     m->indices[ib+1] = base+1; m->indices[ib+2] = base+2;
        m->indices[ib+3] = base;     m->indices[ib+4] = base+2; m->indices[ib+5] = base+3;
    }

    mesh_build_edges(m);
    return m;
}

axl_mesh_t *axl_prim_cylinder(float radius, float height, uint32_t seg) {
    if (seg < 3) seg = 3;
    axl_mesh_t *m = axl_mesh_alloc();
    float hh = height * 0.5f;

    /* Side: (seg+1)*2 verts, seg*6 indices
     * Top cap: 1+seg verts, seg*3 indices
     * Bot cap: 1+seg verts, seg*3 indices */
    uint32_t side_verts  = (seg + 1) * 2;
    uint32_t cap_verts   = 1 + seg;
    uint32_t total_verts = side_verts + cap_verts * 2;
    uint32_t side_idx    = seg * 6;
    uint32_t cap_idx     = seg * 3;
    uint32_t total_idx   = side_idx + cap_idx * 2;

    mesh_reserve_verts(m, total_verts);
    mesh_reserve_indices(m, total_idx);

    /* Side */
    for (uint32_t i = 0; i <= seg; i++) {
        float a = (float)(2.0 * M_PI * i / seg);
        float c = cosf(a), s = sinf(a);
        axl_vec3_t n = v3_normalize(v3(c, 0, s));
        mesh_set_vert(m, i * 2,     v3(c * radius, -hh, s * radius), n);
        mesh_set_vert(m, i * 2 + 1, v3(c * radius,  hh, s * radius), n);
    }
    for (uint32_t i = 0; i < seg; i++) {
        uint32_t a = i * 2, b = a + 1, cc = a + 2, dd = a + 3;
        uint32_t ib = i * 6;
        m->indices[ib+0]=a; m->indices[ib+1]=cc; m->indices[ib+2]=b;
        m->indices[ib+3]=b; m->indices[ib+4]=cc; m->indices[ib+5]=dd;
    }

    /* Top cap */
    uint32_t top_base = side_verts;
    mesh_set_vert(m, top_base, v3(0, hh, 0), v3(0, 1, 0));
    for (uint32_t i = 0; i < seg; i++) {
        float a = (float)(2.0 * M_PI * i / seg);
        mesh_set_vert(m, top_base + 1 + i,
                      v3(cosf(a)*radius, hh, sinf(a)*radius), v3(0, 1, 0));
    }
    for (uint32_t i = 0; i < seg; i++) {
        uint32_t ib = side_idx + i * 3;
        m->indices[ib+0] = top_base;
        m->indices[ib+1] = top_base + 1 + i;
        m->indices[ib+2] = top_base + 1 + ((i + 1) % seg);
    }

    /* Bottom cap */
    uint32_t bot_base = side_verts + cap_verts;
    mesh_set_vert(m, bot_base, v3(0, -hh, 0), v3(0, -1, 0));
    for (uint32_t i = 0; i < seg; i++) {
        float a = (float)(2.0 * M_PI * i / seg);
        mesh_set_vert(m, bot_base + 1 + i,
                      v3(cosf(a)*radius, -hh, sinf(a)*radius), v3(0, -1, 0));
    }
    for (uint32_t i = 0; i < seg; i++) {
        uint32_t ib = side_idx + cap_idx + i * 3;
        m->indices[ib+0] = bot_base;
        m->indices[ib+1] = bot_base + 1 + ((i + 1) % seg);
        m->indices[ib+2] = bot_base + 1 + i;
    }

    mesh_build_edges(m);
    return m;
}

axl_mesh_t *axl_prim_sphere(float radius, uint32_t rings, uint32_t seg) {
    if (rings < 2) rings = 2;
    if (seg < 3) seg = 3;
    axl_mesh_t *m = axl_mesh_alloc();

    uint32_t nverts = (rings + 1) * (seg + 1);
    uint32_t nidx   = rings * seg * 6;
    mesh_reserve_verts(m, nverts);
    mesh_reserve_indices(m, nidx);

    uint32_t vi = 0;
    for (uint32_t r = 0; r <= rings; r++) {
        float phi = (float)(M_PI * r / rings);
        float sp = sinf(phi), cp = cosf(phi);
        for (uint32_t s = 0; s <= seg; s++) {
            float theta = (float)(2.0 * M_PI * s / seg);
            axl_vec3_t n = v3(sp * cosf(theta), cp, sp * sinf(theta));
            mesh_set_vert(m, vi, v3_scale(n, radius), n);
            vi++;
        }
    }

    uint32_t ii = 0;
    for (uint32_t r = 0; r < rings; r++) {
        for (uint32_t s = 0; s < seg; s++) {
            uint32_t a = r * (seg + 1) + s;
            uint32_t b = a + seg + 1;
            m->indices[ii++] = a;   m->indices[ii++] = b;   m->indices[ii++] = a+1;
            m->indices[ii++] = a+1; m->indices[ii++] = b;   m->indices[ii++] = b+1;
        }
    }

    mesh_build_edges(m);
    return m;
}

axl_mesh_t *axl_prim_cone(float radius, float height, uint32_t seg) {
    if (seg < 3) seg = 3;
    axl_mesh_t *m = axl_mesh_alloc();
    float hh = height * 0.5f;

    /* Side: (seg+1)*2 verts, seg*3 indices  (fan from apex)
     * Base: 1+seg verts, seg*3 indices */
    uint32_t side_v = seg + 1;   /* apex + seg rim verts */
    uint32_t base_v = 1 + seg;   /* center + seg rim verts */
    mesh_reserve_verts(m, side_v + base_v);
    mesh_reserve_indices(m, seg * 3 + seg * 3);

    /* Side: apex at top */
    mesh_set_vert(m, 0, v3(0, hh, 0), v3(0, 1, 0));
    for (uint32_t i = 0; i < seg; i++) {
        float a = (float)(2.0 * M_PI * i / seg);
        float c = cosf(a), s = sinf(a);
        /* Approximate normal for cone side */
        float slope = radius / height;
        axl_vec3_t n = v3_normalize(v3(c, slope, s));
        mesh_set_vert(m, 1 + i, v3(c * radius, -hh, s * radius), n);
    }
    for (uint32_t i = 0; i < seg; i++) {
        uint32_t ib = i * 3;
        m->indices[ib+0] = 0;
        m->indices[ib+1] = 1 + i;
        m->indices[ib+2] = 1 + ((i + 1) % seg);
    }

    /* Base cap */
    uint32_t bb = side_v;
    mesh_set_vert(m, bb, v3(0, -hh, 0), v3(0, -1, 0));
    for (uint32_t i = 0; i < seg; i++) {
        float a = (float)(2.0 * M_PI * i / seg);
        mesh_set_vert(m, bb + 1 + i,
                      v3(cosf(a)*radius, -hh, sinf(a)*radius), v3(0, -1, 0));
    }
    for (uint32_t i = 0; i < seg; i++) {
        uint32_t ib = seg * 3 + i * 3;
        m->indices[ib+0] = bb;
        m->indices[ib+1] = bb + 1 + ((i + 1) % seg);
        m->indices[ib+2] = bb + 1 + i;
    }

    mesh_build_edges(m);
    return m;
}

axl_mesh_t *axl_prim_torus(float major_r, float minor_r,
                            uint32_t major_seg, uint32_t minor_seg) {
    if (major_seg < 3) major_seg = 3;
    if (minor_seg < 3) minor_seg = 3;
    axl_mesh_t *m = axl_mesh_alloc();

    uint32_t nverts = (major_seg + 1) * (minor_seg + 1);
    uint32_t nidx   = major_seg * minor_seg * 6;
    mesh_reserve_verts(m, nverts);
    mesh_reserve_indices(m, nidx);

    uint32_t vi = 0;
    for (uint32_t i = 0; i <= major_seg; i++) {
        float u = (float)(2.0 * M_PI * i / major_seg);
        float cu = cosf(u), su = sinf(u);
        for (uint32_t j = 0; j <= minor_seg; j++) {
            float vv = (float)(2.0 * M_PI * j / minor_seg);
            float cv = cosf(vv), sv = sinf(vv);
            float x = (major_r + minor_r * cv) * cu;
            float y = minor_r * sv;
            float z = (major_r + minor_r * cv) * su;
            axl_vec3_t n = v3_normalize(v3(cv * cu, sv, cv * su));
            mesh_set_vert(m, vi, v3(x, y, z), n);
            vi++;
        }
    }

    uint32_t ii = 0;
    for (uint32_t i = 0; i < major_seg; i++) {
        for (uint32_t j = 0; j < minor_seg; j++) {
            uint32_t a = i * (minor_seg + 1) + j;
            uint32_t b = a + minor_seg + 1;
            m->indices[ii++] = a;   m->indices[ii++] = b;   m->indices[ii++] = a+1;
            m->indices[ii++] = a+1; m->indices[ii++] = b;   m->indices[ii++] = b+1;
        }
    }

    mesh_build_edges(m);
    return m;
}

/* ========================================================================= */
/* Extrude                                                                   */
/* ========================================================================= */

axl_mesh_t *axl_extrude(const axl_point2d_t *profile, uint32_t npts,
                         axl_vec3_t dir, float distance) {
    if (npts < 3) return axl_mesh_alloc();
    axl_mesh_t *m = axl_mesh_alloc();
    axl_vec3_t d = v3_scale(v3_normalize(dir), distance);

    /* Bottom + top + sides
     * Bottom: npts verts, (npts-2)*3 indices (fan)
     * Top:    npts verts, (npts-2)*3 indices
     * Sides:  npts*4 verts, npts*6 indices */
    uint32_t total_v = npts * 2 + npts * 4;
    uint32_t total_i = (npts - 2) * 3 * 2 + npts * 6;
    mesh_reserve_verts(m, total_v);
    mesh_reserve_indices(m, total_i);

    axl_vec3_t bot_n = v3_scale(v3_normalize(d), -1.0f);
    axl_vec3_t top_n = v3_normalize(d);

    /* Bottom face */
    for (uint32_t i = 0; i < npts; i++) {
        mesh_set_vert(m, i, v3(profile[i].x, profile[i].y, 0), bot_n);
    }
    uint32_t ii = 0;
    for (uint32_t i = 1; i < npts - 1; i++) {
        m->indices[ii++] = 0;
        m->indices[ii++] = i + 1;
        m->indices[ii++] = i;
    }

    /* Top face */
    uint32_t top_base = npts;
    for (uint32_t i = 0; i < npts; i++) {
        axl_vec3_t pos = v3_add(v3(profile[i].x, profile[i].y, 0), d);
        mesh_set_vert(m, top_base + i, pos, top_n);
    }
    for (uint32_t i = 1; i < npts - 1; i++) {
        m->indices[ii++] = top_base;
        m->indices[ii++] = top_base + i;
        m->indices[ii++] = top_base + i + 1;
    }

    /* Side faces */
    uint32_t side_base = npts * 2;
    for (uint32_t i = 0; i < npts; i++) {
        uint32_t j = (i + 1) % npts;
        axl_vec3_t b0 = v3(profile[i].x, profile[i].y, 0);
        axl_vec3_t b1 = v3(profile[j].x, profile[j].y, 0);
        axl_vec3_t t0 = v3_add(b0, d);
        axl_vec3_t t1 = v3_add(b1, d);

        axl_vec3_t edge = v3_sub(b1, b0);
        axl_vec3_t sn = v3_normalize(v3_cross(edge, d));

        uint32_t sb = side_base + i * 4;
        mesh_set_vert(m, sb + 0, b0, sn);
        mesh_set_vert(m, sb + 1, b1, sn);
        mesh_set_vert(m, sb + 2, t1, sn);
        mesh_set_vert(m, sb + 3, t0, sn);

        m->indices[ii++] = sb;     m->indices[ii++] = sb + 1; m->indices[ii++] = sb + 2;
        m->indices[ii++] = sb;     m->indices[ii++] = sb + 2; m->indices[ii++] = sb + 3;
    }

    mesh_build_edges(m);
    return m;
}

/* ========================================================================= */
/* Revolve                                                                   */
/* ========================================================================= */

axl_mesh_t *axl_revolve(const axl_point2d_t *profile, uint32_t npts,
                         float angle_deg, uint32_t seg) {
    if (npts < 2 || seg < 3) return axl_mesh_alloc();
    axl_mesh_t *m = axl_mesh_alloc();
    float angle_rad = angle_deg * (float)(M_PI / 180.0);
    int closed = (fabsf(angle_deg) >= 360.0f);

    uint32_t steps = seg;
    uint32_t ring_verts = (steps + 1) * npts;
    uint32_t ring_idx   = steps * (npts - 1) * 6;
    uint32_t cap_verts  = closed ? 0 : npts * 2;
    uint32_t cap_idx    = closed ? 0 : (npts - 2) * 3 * 2;

    mesh_reserve_verts(m, ring_verts + cap_verts);
    mesh_reserve_indices(m, ring_idx + cap_idx);

    /* Generate rings */
    uint32_t vi = 0;
    for (uint32_t s = 0; s <= steps; s++) {
        float a = angle_rad * (float)s / (float)steps;
        float ca = cosf(a), sa = sinf(a);
        for (uint32_t p = 0; p < npts; p++) {
            float px = profile[p].x;
            float py = profile[p].y;
            axl_vec3_t pos = v3(px * ca, py, px * sa);
            axl_vec3_t n = v3_normalize(v3(ca, 0, sa));
            mesh_set_vert(m, vi, pos, n);
            vi++;
        }
    }

    /* Connect rings */
    uint32_t ii = 0;
    for (uint32_t s = 0; s < steps; s++) {
        for (uint32_t p = 0; p < npts - 1; p++) {
            uint32_t a = s * npts + p;
            uint32_t b = a + 1;
            uint32_t c = (s + 1) * npts + p;
            uint32_t dd = c + 1;
            m->indices[ii++] = a;  m->indices[ii++] = c;  m->indices[ii++] = b;
            m->indices[ii++] = b;  m->indices[ii++] = c;  m->indices[ii++] = dd;
        }
    }

    /* Caps for partial revolves */
    if (!closed) {
        /* Start cap */
        uint32_t sc = ring_verts;
        for (uint32_t p = 0; p < npts; p++) {
            axl_vec3_t pos = v3(profile[p].x, profile[p].y, 0);
            mesh_set_vert(m, sc + p, pos, v3(0, 0, -1));
        }
        for (uint32_t i = 1; i < npts - 1; i++) {
            m->indices[ii++] = sc;
            m->indices[ii++] = sc + i;
            m->indices[ii++] = sc + i + 1;
        }

        /* End cap */
        uint32_t ec = ring_verts + npts;
        float ea = angle_rad;
        float cea = cosf(ea), sea = sinf(ea);
        for (uint32_t p = 0; p < npts; p++) {
            float px = profile[p].x, py = profile[p].y;
            mesh_set_vert(m, ec + p, v3(px * cea, py, px * sea),
                          v3_normalize(v3(sea, 0, -cea)));
        }
        for (uint32_t i = 1; i < npts - 1; i++) {
            m->indices[ii++] = ec;
            m->indices[ii++] = ec + i + 1;
            m->indices[ii++] = ec + i;
        }
    }

    mesh_build_edges(m);
    return m;
}

/* ========================================================================= */
/* CSG Boolean                                                               */
/* ========================================================================= */

/* Internal: merge two meshes into one new mesh. */
static axl_mesh_t *merge_meshes(const axl_mesh_t *a, const axl_mesh_t *b) {
    axl_mesh_t *m = axl_mesh_alloc();
    uint32_t va = a->vertex_count, vb = b->vertex_count;
    uint32_t ia = a->index_count,  ib = b->index_count;

    mesh_reserve_verts(m, va + vb);
    mesh_reserve_indices(m, ia + ib);

    memcpy(m->vertices, a->vertices, va * 3 * sizeof(float));
    memcpy(m->normals,  a->normals,  va * 3 * sizeof(float));
    memcpy(m->vertices + va * 3, b->vertices, vb * 3 * sizeof(float));
    memcpy(m->normals  + va * 3, b->normals,  vb * 3 * sizeof(float));

    memcpy(m->indices, a->indices, ia * sizeof(uint32_t));
    for (uint32_t i = 0; i < ib; i++) {
        m->indices[ia + i] = b->indices[i] + va;
    }

    mesh_build_edges(m);
    return m;
}

/* Internal: invert a mesh (flip normals, reverse winding). */
static axl_mesh_t *invert_mesh(const axl_mesh_t *src) {
    axl_mesh_t *m = axl_mesh_alloc();
    uint32_t nv = src->vertex_count, ni = src->index_count;

    mesh_reserve_verts(m, nv);
    mesh_reserve_indices(m, ni);

    memcpy(m->vertices, src->vertices, nv * 3 * sizeof(float));
    for (uint32_t i = 0; i < nv * 3; i++) {
        m->normals[i] = -src->normals[i];
    }
    /* Reverse winding */
    for (uint32_t i = 0; i < ni; i += 3) {
        m->indices[i + 0] = src->indices[i + 0];
        m->indices[i + 1] = src->indices[i + 2];
        m->indices[i + 2] = src->indices[i + 1];
    }

    mesh_build_edges(m);
    return m;
}

/* bbox-based triangle filtering for intersection approximation */
static int in_bbox(axl_vec3_t p, axl_vec3_t bmin, axl_vec3_t bmax) {
    return p.x >= bmin.x && p.x <= bmax.x &&
           p.y >= bmin.y && p.y <= bmax.y &&
           p.z >= bmin.z && p.z <= bmax.z;
}

static axl_mesh_t *filter_by_bbox(const axl_mesh_t *mesh,
                                   axl_vec3_t bmin, axl_vec3_t bmax) {
    axl_mesh_t *m = axl_mesh_alloc();
    /* Worst case: all triangles pass */
    uint32_t max_v = mesh->vertex_count;
    uint32_t max_i = mesh->index_count;
    mesh_reserve_verts(m, max_v);
    mesh_reserve_indices(m, max_i);

    /* Map old vertex indices to new ones */
    int32_t *remap = (int32_t *)malloc(max_v * sizeof(int32_t));
    if (!remap) {
        axl_mesh_free(m);
        return axl_mesh_alloc(); /* return empty mesh on OOM */
    }
    memset(remap, -1, max_v * sizeof(int32_t));
    uint32_t nv = 0, ni = 0;

    for (uint32_t i = 0; i < mesh->index_count; i += 3) {
        uint32_t i0 = mesh->indices[i], i1 = mesh->indices[i+1], i2 = mesh->indices[i+2];
        /* Centroid test */
        float cx = (mesh->vertices[i0*3] + mesh->vertices[i1*3] + mesh->vertices[i2*3]) / 3.0f;
        float cy = (mesh->vertices[i0*3+1] + mesh->vertices[i1*3+1] + mesh->vertices[i2*3+1]) / 3.0f;
        float cz = (mesh->vertices[i0*3+2] + mesh->vertices[i1*3+2] + mesh->vertices[i2*3+2]) / 3.0f;
        axl_vec3_t centroid = v3(cx, cy, cz);

        if (in_bbox(centroid, bmin, bmax)) {
            uint32_t tri[3] = { i0, i1, i2 };
            for (int t = 0; t < 3; t++) {
                uint32_t idx = tri[t];
                if (remap[idx] < 0) {
                    remap[idx] = (int32_t)nv;
                    m->vertices[nv*3+0] = mesh->vertices[idx*3+0];
                    m->vertices[nv*3+1] = mesh->vertices[idx*3+1];
                    m->vertices[nv*3+2] = mesh->vertices[idx*3+2];
                    m->normals[nv*3+0]  = mesh->normals[idx*3+0];
                    m->normals[nv*3+1]  = mesh->normals[idx*3+1];
                    m->normals[nv*3+2]  = mesh->normals[idx*3+2];
                    nv++;
                }
                m->indices[ni++] = (uint32_t)remap[idx];
            }
        }
    }

    free(remap);
    m->vertex_count = nv;
    m->index_count  = ni;
    /* Shrink allocations */
    m->vertices = (float *)realloc(m->vertices, nv * 3 * sizeof(float));
    m->normals  = (float *)realloc(m->normals,  nv * 3 * sizeof(float));
    m->indices  = (uint32_t *)realloc(m->indices, ni * sizeof(uint32_t));

    mesh_build_edges(m);
    return m;
}

axl_mesh_t *axl_boolean(const axl_mesh_t *a, const axl_mesh_t *b,
                         axl_bool_op_t op) {
    if (!a || !b) return axl_mesh_alloc();

    switch (op) {
    case AXL_BOOL_UNION:
        return merge_meshes(a, b);

    case AXL_BOOL_SUBTRACT: {
        axl_mesh_t *inv = invert_mesh(b);
        axl_mesh_t *result = merge_meshes(a, inv);
        axl_mesh_free(inv);
        return result;
    }

    case AXL_BOOL_INTERSECT: {
        axl_vec3_t amin, amax, bmin, bmax;
        axl_bbox(a, &amin, &amax);
        axl_bbox(b, &bmin, &bmax);
        axl_mesh_t *fa = filter_by_bbox(a, bmin, bmax);
        axl_mesh_t *fb = filter_by_bbox(b, amin, amax);
        axl_mesh_t *result = merge_meshes(fa, fb);
        axl_mesh_free(fa);
        axl_mesh_free(fb);
        return result;
    }

    default:
        return axl_mesh_alloc();
    }
}

/* ========================================================================= */
/* Queries                                                                   */
/* ========================================================================= */

float axl_volume(const axl_mesh_t *mesh) {
    if (!mesh || mesh->index_count == 0) return 0.0f;
    float vol = 0.0f;
    for (uint32_t i = 0; i < mesh->index_count; i += 3) {
        uint32_t i0 = mesh->indices[i], i1 = mesh->indices[i+1], i2 = mesh->indices[i+2];
        float ax = mesh->vertices[i0*3], ay = mesh->vertices[i0*3+1], az = mesh->vertices[i0*3+2];
        float bx = mesh->vertices[i1*3], by = mesh->vertices[i1*3+1], bz = mesh->vertices[i1*3+2];
        float cx = mesh->vertices[i2*3], cy = mesh->vertices[i2*3+1], cz = mesh->vertices[i2*3+2];
        vol += (ax * (by * cz - cy * bz)
              - bx * (ay * cz - cy * az)
              + cx * (ay * bz - by * az)) / 6.0f;
    }
    return fabsf(vol);
}

float axl_surface_area(const axl_mesh_t *mesh) {
    if (!mesh || mesh->index_count == 0) return 0.0f;
    float area = 0.0f;
    for (uint32_t i = 0; i < mesh->index_count; i += 3) {
        uint32_t i0 = mesh->indices[i], i1 = mesh->indices[i+1], i2 = mesh->indices[i+2];
        axl_vec3_t a = { mesh->vertices[i0*3], mesh->vertices[i0*3+1], mesh->vertices[i0*3+2] };
        axl_vec3_t b = { mesh->vertices[i1*3], mesh->vertices[i1*3+1], mesh->vertices[i1*3+2] };
        axl_vec3_t c = { mesh->vertices[i2*3], mesh->vertices[i2*3+1], mesh->vertices[i2*3+2] };
        axl_vec3_t ab = v3_sub(b, a);
        axl_vec3_t ac = v3_sub(c, a);
        area += v3_len(v3_cross(ab, ac)) * 0.5f;
    }
    return area;
}

void axl_bbox(const axl_mesh_t *mesh, axl_vec3_t *out_min, axl_vec3_t *out_max) {
    if (!mesh || mesh->vertex_count == 0) {
        *out_min = v3(0, 0, 0);
        *out_max = v3(0, 0, 0);
        return;
    }
    float mnx = mesh->vertices[0], mny = mesh->vertices[1], mnz = mesh->vertices[2];
    float mxx = mnx, mxy = mny, mxz = mnz;
    for (uint32_t i = 1; i < mesh->vertex_count; i++) {
        float x = mesh->vertices[i*3], y = mesh->vertices[i*3+1], z = mesh->vertices[i*3+2];
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
        if (z < mnz) mnz = z;
        if (z > mxz) mxz = z;
    }
    *out_min = v3(mnx, mny, mnz);
    *out_max = v3(mxx, mxy, mxz);
}

uint32_t axl_edge_count(const axl_mesh_t *mesh) {
    if (!mesh) return 0;
    return mesh->edge_count;
}

int axl_is_manifold(const axl_mesh_t *mesh) {
    if (!mesh || mesh->index_count == 0) return 0;

    /* Count how many triangles share each edge.
     * Manifold = every edge has exactly 2 adjacent faces. */
    uint32_t cap = mesh->index_count;
    uint32_t p = 64;
    while (p < cap * 2) p <<= 1;

    /* Hash table: key = packed edge, value = count */
    typedef struct { uint64_t key; uint32_t count; } slot_t;
    slot_t *table = (slot_t *)calloc(p, sizeof(slot_t));
    uint32_t mask = p - 1;

    for (uint32_t i = 0; i < mesh->index_count; i += 3) {
        uint32_t tri[3] = { mesh->indices[i], mesh->indices[i+1], mesh->indices[i+2] };
        for (int e = 0; e < 3; e++) {
            uint32_t a = tri[e], b = tri[(e + 1) % 3];
            if (a > b) { uint32_t t = a; a = b; b = t; }
            uint64_t key = ((uint64_t)a << 32) | (uint64_t)b;
            uint64_t stored = key | 1;
            uint32_t slot = (uint32_t)((key * 2654435761ULL) >> 16) & mask;
            for (uint32_t probe = 0; probe < p; probe++) {
                uint32_t idx = (slot + probe) & mask;
                if (table[idx].key == 0) {
                    table[idx].key = stored;
                    table[idx].count = 1;
                    break;
                }
                if (table[idx].key == stored) {
                    table[idx].count++;
                    break;
                }
            }
        }
    }

    int manifold = 1;
    for (uint32_t i = 0; i < p; i++) {
        if (table[i].key != 0 && table[i].count != 2) {
            manifold = 0;
            break;
        }
    }

    free(table);
    return manifold;
}
