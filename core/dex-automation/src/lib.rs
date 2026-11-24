// =============================================================================
// DEX 6.0 — Native Automation Engine (GOAL-6C)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Executes a workflow/automation definition: an ordered list of steps run over
//! a string-keyed context, with `${var}` interpolation. Pure logic (no IO), so
//! it is fully unit-testable. Step types: setVar, transform, concat, math,
//! condition (a gate that stops the run when unmet), and log. Unknown step types
//! are skipped gracefully so newer renderer node types never hard-fail.

use serde_json::{json, Map, Value};

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn num(v: &Value) -> f64 {
    v.as_f64()
        .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
        .unwrap_or(0.0)
}

/// Replace every `${name}` in `template` with the context value (recursively safe;
/// only one pass, so values containing `${...}` are not re-expanded).
fn resolve(template: &str, ctx: &Map<String, Value>) -> String {
    if !template.contains("${") {
        return template.to_string();
    }
    let mut result = template.to_string();
    for (k, v) in ctx {
        let needle = format!("${{{}}}", k);
        if result.contains(&needle) {
            result = result.replace(&needle, &value_to_string(v));
        }
    }
    result
}

fn eval_condition(ctx: &Map<String, Value>, step: &Value) -> bool {
    let var = step.get("var").and_then(|v| v.as_str()).unwrap_or("");
    let op = step.get("op").and_then(|v| v.as_str()).unwrap_or("eq");
    let expected = step.get("value").cloned().unwrap_or(Value::Null);
    let actual = ctx.get(var).cloned().unwrap_or(Value::Null);
    match op {
        "eq" => value_to_string(&actual) == value_to_string(&expected),
        "neq" => value_to_string(&actual) != value_to_string(&expected),
        "contains" => value_to_string(&actual).contains(&value_to_string(&expected)),
        "exists" => ctx.contains_key(var),
        "gt" => num(&actual) > num(&expected),
        "lt" => num(&actual) < num(&expected),
        "gte" => num(&actual) >= num(&expected),
        "lte" => num(&actual) <= num(&expected),
        "startsWith" => value_to_string(&actual).starts_with(&value_to_string(&expected)),
        "endsWith" => value_to_string(&actual).ends_with(&value_to_string(&expected)),
        _ => true,
    }
}

/// Run an automation `definition` (`{ "steps": [...] }`) with `inputs` seeding the
/// context. Returns `{ success, context, log, stepsRun }`.
pub fn run(definition: &Value, inputs: &Value) -> Value {
    let mut ctx: Map<String, Value> = inputs.as_object().cloned().unwrap_or_default();
    let mut log: Vec<String> = Vec::new();

    let steps = match definition.get("steps").and_then(|s| s.as_array()) {
        Some(s) => s,
        None => {
            return json!({
                "success": false, "error": "automation has no steps",
                "context": Value::Object(ctx), "log": log, "stepsRun": 0,
            })
        }
    };

    let mut ran = 0usize;
    let mut stopped = false;

    for step in steps {
        ran += 1;
        let stype = step.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let s = |k: &str| {
            step.get(k)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };

        match stype {
            "setVar" => {
                let name = s("name");
                if !name.is_empty() {
                    let value = match step.get("value") {
                        Some(Value::String(t)) => Value::String(resolve(t, &ctx)),
                        Some(other) => other.clone(),
                        None => Value::Null,
                    };
                    ctx.insert(name, value);
                }
            }
            "transform" => {
                let var = s("var");
                if let Some(cur) = ctx.get(&var).map(value_to_string) {
                    let out = match s("op").as_str() {
                        "uppercase" => cur.to_uppercase(),
                        "lowercase" => cur.to_lowercase(),
                        "trim" => cur.trim().to_string(),
                        "reverse" => cur.chars().rev().collect(),
                        "replace" => cur.replace(&s("from"), &s("to")),
                        "length" => cur.chars().count().to_string(),
                        _ => cur,
                    };
                    ctx.insert(var, Value::String(out));
                }
            }
            "concat" => {
                let into = s("into");
                if !into.is_empty() {
                    let parts = step
                        .get("parts")
                        .and_then(|p| p.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let joined: String = parts
                        .iter()
                        .map(|p| resolve(&value_to_string(p), &ctx))
                        .collect();
                    ctx.insert(into, Value::String(joined));
                }
            }
            "math" => {
                let var = s("var");
                if !var.is_empty() {
                    let cur = ctx.get(&var).map(num).unwrap_or(0.0);
                    let operand = match step.get("value") {
                        Some(Value::String(t)) => {
                            resolve(t, &ctx).trim().parse::<f64>().unwrap_or(0.0)
                        }
                        Some(v) => num(v),
                        None => 0.0,
                    };
                    let result = match s("op").as_str() {
                        "add" => cur + operand,
                        "sub" => cur - operand,
                        "mul" => cur * operand,
                        "div" => {
                            if operand != 0.0 {
                                cur / operand
                            } else {
                                cur
                            }
                        }
                        _ => cur,
                    };
                    ctx.insert(var, json!(result));
                }
            }
            "condition" => {
                if !eval_condition(&ctx, step) {
                    log.push(format!("stopped: condition on '{}' not met", s("var")));
                    stopped = true;
                    break;
                }
            }
            "log" => log.push(resolve(&s("message"), &ctx)),
            "" => {}
            other => log.push(format!("skipped unknown step '{}'", other)),
        }
    }

    json!({
        "success": !stopped,
        "context": Value::Object(ctx),
        "log": log,
        "stepsRun": ran,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_a_linear_automation() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "name", "value": "world" },
            { "type": "transform", "var": "name", "op": "uppercase" },
            { "type": "concat", "into": "greeting", "parts": ["Hello, ", "${name}", "!"] },
            { "type": "log", "message": "made ${greeting}" }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["success"], json!(true));
        assert_eq!(out["context"]["greeting"], json!("Hello, WORLD!"));
        assert_eq!(out["stepsRun"], json!(4));
        assert!(out["log"][0].as_str().unwrap().contains("Hello, WORLD!"));
    }

    #[test]
    fn condition_stops_execution() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "x", "value": "5" },
            { "type": "condition", "var": "x", "op": "gt", "value": 10 },
            { "type": "setVar", "name": "reached", "value": "yes" }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["success"], json!(false));
        assert!(out["context"].get("reached").is_none());
        assert_eq!(out["stepsRun"], json!(2));
    }

    #[test]
    fn passes_inputs_and_skips_unknown_steps() {
        let def = json!({ "steps": [
            { "type": "futuristic-node", "config": {} },
            { "type": "concat", "into": "out", "parts": ["${greeting} ", "${user}"] }
        ]});
        let out = run(&def, &json!({ "greeting": "hi", "user": "OJ" }));
        assert_eq!(out["context"]["out"], json!("hi OJ"));
        assert_eq!(out["stepsRun"], json!(2));
    }

    #[test]
    fn missing_steps_is_a_graceful_failure() {
        let out = run(&json!({}), &json!({}));
        assert_eq!(out["success"], json!(false));
        assert_eq!(out["stepsRun"], json!(0));
    }

    #[test]
    fn math_step_and_gte_condition() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "n", "value": "10" },
            { "type": "math", "var": "n", "op": "add", "value": 5 },
            { "type": "math", "var": "n", "op": "mul", "value": 2 },
            { "type": "condition", "var": "n", "op": "gte", "value": 30 },
            { "type": "setVar", "name": "ok", "value": "yes" }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["context"]["n"], json!(30.0));
        assert_eq!(out["context"]["ok"], json!("yes"));
        assert_eq!(out["success"], json!(true));
    }

    #[test]
    fn math_div_by_zero_is_safe() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "x", "value": "8" },
            { "type": "math", "var": "x", "op": "div", "value": 0 }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["context"]["x"], json!(8.0)); // unchanged, not NaN/Inf
    }

    #[test]
    fn length_transform_and_prefix_condition() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "s", "value": "hello" },
            { "type": "condition", "var": "s", "op": "startsWith", "value": "he" },
            { "type": "transform", "var": "s", "op": "length" }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["context"]["s"], json!("5"));
        assert_eq!(out["success"], json!(true));
    }

    #[test]
    fn lte_condition_stops_when_unmet() {
        let def = json!({ "steps": [
            { "type": "setVar", "name": "x", "value": "100" },
            { "type": "condition", "var": "x", "op": "lte", "value": 50 },
            { "type": "setVar", "name": "reached", "value": "yes" }
        ]});
        let out = run(&def, &json!({}));
        assert_eq!(out["success"], json!(false));
        assert!(out["context"].get("reached").is_none());
    }
}
