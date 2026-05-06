// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Matrix Operations -- 4x4 matrix math for 3D projection pipelines
// Column-major layout compatible with OpenGL/WebGL conventions.
// Used by Nexus 3D visualizer and AXL engineering renderer.
// ===========================================================================

#ifndef DEX_MATRIX_H
#define DEX_MATRIX_H

#include <napi.h>
#include <cmath>
#include <array>
#include <cstdint>

// ---------------------------------------------------------------------------
// 4x4 matrix (column-major, 16 doubles)
// ---------------------------------------------------------------------------
using Mat4 = std::array<double, 16>;

static Mat4 mat4_identity() {
    return {
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1
    };
}

static Mat4 mat4_multiply(const Mat4& a, const Mat4& b) {
    Mat4 out{};
    for (int col = 0; col < 4; ++col) {
        for (int row = 0; row < 4; ++row) {
            double sum = 0.0;
            for (int k = 0; k < 4; ++k) {
                sum += a[k * 4 + row] * b[col * 4 + k];
            }
            out[col * 4 + row] = sum;
        }
    }
    return out;
}

static Mat4 mat4_rotate_x(double angle) {
    double c = std::cos(angle);
    double s = std::sin(angle);
    return {
        1, 0, 0, 0,
        0, c, s, 0,
        0,-s, c, 0,
        0, 0, 0, 1
    };
}

static Mat4 mat4_rotate_y(double angle) {
    double c = std::cos(angle);
    double s = std::sin(angle);
    return {
        c, 0,-s, 0,
        0, 1, 0, 0,
        s, 0, c, 0,
        0, 0, 0, 1
    };
}

static Mat4 mat4_perspective(double fovY, double aspect, double near, double far) {
    double f = 1.0 / std::tan(fovY * 0.5);
    double nf = 1.0 / (near - far);
    return {
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    };
}

// Project a 3D point through modelViewProjection -> screen coords
struct Vec4 { double x, y, z, w; };
static Vec4 mat4_transform(const Mat4& m, double x, double y, double z) {
    return {
        m[0]*x + m[4]*y + m[8]*z  + m[12],
        m[1]*x + m[5]*y + m[9]*z  + m[13],
        m[2]*x + m[6]*y + m[10]*z + m[14],
        m[3]*x + m[7]*y + m[11]*z + m[15],
    };
}

// ---------------------------------------------------------------------------
// Helper: Mat4 -> JS Float64Array
// ---------------------------------------------------------------------------
static Napi::Value mat4ToJs(Napi::Env env, const Mat4& m) {
    Napi::Float64Array out = Napi::Float64Array::New(env, 16);
    for (int i = 0; i < 16; ++i) out[i] = m[i];
    return out;
}

// Helper: JS array/Float64Array -> Mat4
static Mat4 jsToMat4(Napi::Value val) {
    Mat4 out{};
    if (val.IsTypedArray()) {
        Napi::Float64Array ta = val.As<Napi::Float64Array>();
        for (size_t i = 0; i < 16 && i < ta.ElementLength(); ++i) out[i] = ta[i];
    } else if (val.IsArray()) {
        Napi::Array arr = val.As<Napi::Array>();
        for (uint32_t i = 0; i < 16 && i < arr.Length(); ++i) {
            out[i] = arr.Get(i).As<Napi::Number>().DoubleValue();
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// mat4Identity() -> Float64Array[16]
inline Napi::Value Mat4Identity(const Napi::CallbackInfo& info) {
    return mat4ToJs(info.Env(), mat4_identity());
}

// mat4Multiply(a: number[16], b: number[16]) -> Float64Array[16]
inline Napi::Value Mat4Multiply(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: mat4Multiply(a, b)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto a = jsToMat4(info[0]);
    auto b = jsToMat4(info[1]);
    return mat4ToJs(env, mat4_multiply(a, b));
}

// mat4RotateX(angle: number) -> Float64Array[16]
inline Napi::Value Mat4RotateX(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected: mat4RotateX(angle)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    return mat4ToJs(env, mat4_rotate_x(info[0].As<Napi::Number>().DoubleValue()));
}

// mat4RotateY(angle: number) -> Float64Array[16]
inline Napi::Value Mat4RotateY(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected: mat4RotateY(angle)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    return mat4ToJs(env, mat4_rotate_y(info[0].As<Napi::Number>().DoubleValue()));
}

// mat4Perspective(fovY, aspect, near, far) -> Float64Array[16]
inline Napi::Value Mat4Perspective(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected: mat4Perspective(fovY, aspect, near, far)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    double fov    = info[0].As<Napi::Number>().DoubleValue();
    double aspect = info[1].As<Napi::Number>().DoubleValue();
    double near   = info[2].As<Napi::Number>().DoubleValue();
    double far    = info[3].As<Napi::Number>().DoubleValue();
    return mat4ToJs(env, mat4_perspective(fov, aspect, near, far));
}

// mat4Project(mvp: number[16], x, y, z, viewportW, viewportH) -> {sx, sy, depth}
inline Napi::Value Mat4Project(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 6) {
        Napi::TypeError::New(env, "Expected: mat4Project(mvp, x, y, z, vpW, vpH)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto mvp = jsToMat4(info[0]);
    double x = info[1].As<Napi::Number>().DoubleValue();
    double y = info[2].As<Napi::Number>().DoubleValue();
    double z = info[3].As<Napi::Number>().DoubleValue();
    double vpW = info[4].As<Napi::Number>().DoubleValue();
    double vpH = info[5].As<Napi::Number>().DoubleValue();

    Vec4 clip = mat4_transform(mvp, x, y, z);
    if (std::fabs(clip.w) < 1e-10) clip.w = 1e-10; // prevent div by zero

    double ndcX = clip.x / clip.w;
    double ndcY = clip.y / clip.w;

    Napi::Object result = Napi::Object::New(env);
    result.Set("sx",    Napi::Number::New(env, (ndcX + 1.0) * 0.5 * vpW));
    result.Set("sy",    Napi::Number::New(env, (1.0 - ndcY) * 0.5 * vpH));
    result.Set("depth", Napi::Number::New(env, clip.z / clip.w));
    return result;
}

#endif // DEX_MATRIX_H
